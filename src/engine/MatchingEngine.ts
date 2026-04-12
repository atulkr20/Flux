import { Mutex } from 'async-mutex';
import { v4 as uuidv4 } from 'uuid';
import type { Order, Trade } from './types';
import { OrderBook } from './OrderBook';

export class MatchingEngine {
    // Each trading symbol like BTC-INR, ETH-INR etc gets its own orderbook
    // we create them on demand
    private books: Map<string, OrderBook> = new Map();

    // Each symbol also gets it's own mutex (lock)
    // This helps in preventing Race conditions
    private mutexes: Map<string, Mutex> = new Map();

    // Stop orders don't go into the book right away
    // They sit here and wait until the market price reaches their trigger price
    private pendingStops: Map<string, Order[]>= new Map();


    //  Helper to get or create a book/mutex for a symbol
    private getBook(symbol: string): OrderBook {
        if(!this.books.has(symbol)) {
            this.books.set(symbol, new OrderBook(symbol));
        }
        return this.books.get(symbol)!;
    }

    private getMutex(symbol: string): Mutex {
        if(!this.mutexes.has(symbol)) {
            this.mutexes.set(symbol, new Mutex());
        }
        return this.mutexes.get(symbol)!;
    }

    // Main entry point - this is called when a user places an order

    public async placeOrder(order: Order): Promise<Trade[]> {

    // Acquire the lock for this symbol
    // if another order for BTC-INR is currently being processed, we wait here and once 
    // order finishes and releases the lock, we proceed
    const release = await this.getMutex(order.symbol).acquire();

    try {
        // If this is a stop order, just park it in the pending list
        // it won't do anything until the market hits its stopPrice
        if(order.type === 'STOP') {
            this.addToStops(order);
            return[]; // no trades happen right now 
        }

        // Get teh order book for this symbol and try to match the order
        const book = this.getBook(order.symbol);
        const trades = this.match(order, book);

    // If it's a limit order and wasn't fully matched, then the remaining quantity will be added to orderbook, so it can be matched later
    if (order.type === 'LIMIT' && order.filledQty < order.quantity) {
        order.status = order.filledQty > 0 ? 'PARTIALLY_FILLED' : 'OPEN';
        book.addOrder(order);
    } 

    // After matching, check if any stop orders got triggered
    if(trades.length > 0) {
        const stopTrades = this.checkStops(order.symbol, book, trades);
        trades.push(...stopTrades);
    }

    return trades;
    } finally {
        release();
        // this release function will always run even if somethign above threw error 
        // otherwise this symbol gets frozen forever
    }
    }

    // Cancel an order by its ID
    public cancelOrder(orderId: string, symbol: string, side: 'BUY' | 'SELL', price: number): boolean {

        // Check pending stops there, bcz stop orders live there, not in the book
        const stops = this.pendingStops.get(symbol) ?? [];
        const stopIndex = stops.findIndex(o => o.id === orderId);
        if(stopIndex !== -1) {
            stops.splice(stopIndex, 1); // Remove it from the pending list
            return true;
        }

        // If it wasn't a stop order, look for it in the actual order book
        const book = this.books.get(symbol);
        if(!book) return false;

        return book.cancelOrder(orderId, side, price);
    }

    // Get the current state of the order book for a symbol
    // This will be used by HTTP route and websocket broadcasts
     
    public getOrderBook(symbol: string) {
        return this.books.get(symbol)?.getDepthSnapshot() ?? null;
    }

    // Add a stop order to the pending list 

    private addToStops(order: Order): void {
        if(!this.pendingStops.has(order.symbol)) {
            this.pendingStops.set(order.symbol, []);
        }
        this.pendingStops.get(order.symbol)!.push(order);
    }

    // After every match, check if any stop orders should fire

    private checkStops(symbol: string, book: OrderBook, recentTrades: Trade[]): Trade[] {
        const stops = this.pendingStops.get(symbol);
        if (!stops || stops.length === 0) return [];

        // we use the price of last trade that jsut happened to decide which stop orders got triggered
        const lastTradePrice = recentTrades[recentTrades.length -1]?.price;
        if (lastTradePrice === undefined) return [];

        const triggered: Order[] = []; // Stops that should fire now
        const stillWaiting: Order[] = []; // stops that haven't triggered yet

        for (const stop of stops) {
            //BUY stop - it fires when price goes up to stop Price
            // SELL stop - fires when price goes DOWN to the stopPrice
            const stopTriggerPrice = stop.stopPrice;
            const triggered_now = 
            stopTriggerPrice !== undefined &&
            ((stop.side === 'BUY' && lastTradePrice >= stopTriggerPrice) ||
            (stop.side === 'SELL' && lastTradePrice <= stopTriggerPrice));

            if(triggered_now) {
                triggered.push(stop);
            } else {
                stillWaiting.push(stop);
            }
        }

        // Update the pending list to only keep the ones still waiting
        this.pendingStops.set(symbol, stillWaiting);

        const allNewTrades: Trade[] = [];

        for (const stop of triggered) {
            // Convert the stop order into a market order and run it immediately
            // A market order means matching the trade right now at whatever price is available
            stop.type = 'MARKET';
            const newTrades = this.match(stop, book);
            allNewTrades.push(...newTrades);

            // A triggered stop can itself cause more trades
            // Those trades might trigger even more stops
            // So we call checkStops again to handle that chain

            if(newTrades.length > 0) {
                const chainTrades = this.checkStops(symbol, book, newTrades);
                allNewTrades.push(...chainTrades);
            }
        }

        return allNewTrades;
    }

    // The actual matching machine
    // This runs when a limit or market order comes in

    private match(order: Order, book: OrderBook): Trade[] {
        const trades: Trade[] = [];

        // Keep trying to match until this order is fully filled
        while(order.filledQty < order.quantity) {
            const remainingQty = order.quantity - order.filledQty;

            // Look at the best available price on the opposite side 
            // if we are buying, we want the cheapest seller
            // if we are selling, we want the higjest bid

            const bestPrice = order.side === 'BUY'
            ? book.getBestAsk(): book.getBestBid();

            //  if there's nobody on the other side, stop trying
            if(bestPrice === null ) break;

            // For limit orders, we only match if the prices make sense
            // Market orders match at any price they skip the LIMIT price checks
            if(order.type === 'LIMIT') {
                if (order.side === 'BUY' && bestPrice > order.price) break;
                if(order.side === 'SELL' && bestPrice < order.price) break;
            }

            // Get the list of orders sitting at this price level 
            // index 0 is the oldest order - it gets priority (first in, first matched)

            const queue = order.side === 'BUY'
            ? book.getAsksAt(bestPrice)
            : book.getBidsAt(bestPrice);

            if(!queue || queue.length === 0) break;

            // The resting order is  the one already sitting in the book
            // Our incoming order is the one trying to match against it 
            const resting = queue[0]!;
            const restingRemaining = resting.quantity - resting.filledQty;

            // we can only trade as much as both sides have available
            const tradeQty = Math.min(remainingQty, restingRemaining);

            // The trade price is always the resting order's price
            // Because the resting order was there first 

            const trade: Trade = {
                id: uuidv4(),
                symbol: order.symbol,
                buyOrderId: order.side === 'BUY' ? order.id : resting.id,
                sellOrderId: order.side === 'SELL' ? order.id : resting.id,
                price: resting.price,
                quantity: tradeQty,
                timestamp:Date.now()
            };

            trades.push(trade);

            // update how much has been filled on both orders
            order.filledQty += tradeQty;
            resting.filledQty += tradeQty;

            // if the resting order is completely done, remove it from the book
            if(resting.filledQty >= resting.quantity) {
                resting.status = 'FILLED';
                book.cancelOrder(resting.id, resting.side, resting.price);
            } else {
                resting.status = 'PARTIALLY_FILLED';
            }

            // CHeck if our incoming order is now fully filled
            if(order.filledQty >= order.quantity) {
                order.status = 'FILLED';
            }


            
        }

        return trades;
    }
}