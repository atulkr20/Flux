import { Mutex } from 'async-mutex';
import { v4 as uuidv4 } from 'uuid';
import type { Order, Trade } from './types';
import { OrderBook } from './OrderBook';

export class MatchingEngine {
    private books: Map<string, OrderBook> = new Map();

    private mutexes: Map<string, Mutex> = new Map();

    // Setup Healers

    private getOrCreateBook(symbol: string): OrderBook {
        if (!this.books.has(symbol)) {
            this.books.set(symbol, new OrderBook(symbol));
        }
        return this.books.get(symbol)!;
    }

    private getOrCreateMutex(symbol:string): Mutex {
        if (!this.mutexes.has(symbol)) {
            this.mutexes.set(symbol, new Mutex());
        }
        return this.mutexes.get(symbol)!;
    }

    // Public API

    public async placeOrder(order: Order): Promise<Trade[]> {
        const mutex = this.getOrCreateMutex(order.symbol);
        const release = await mutex.acquire();

        try {
            const book = this.getOrCreateBook(order.symbol);
            const trades  = this.matchOrder(order, book);

            // Limit orders with remaining quantity sit in the book
            // Market orders with remaining quantity just disappear
            if(order.type === 'LIMIT' && order.quantity > order.filledQty) {
                order.status = order.filledQty > 0 ? 'PARTIALLY_FILLED' : 'OPEN';
                book.addOrder(order);
            }

            return trades;
        } finally {
            // always releases - even if matching throws an error 
            release();
        }
    }

    public cancelOrder(orderId: string, symbol: string, side: 'BUY' | 'SELL', price: number): boolean{
        const book = this.books.get(symbol);
        if(!book) return false;
        return book.cancelOrder(orderId, side, price);
    }

    public getOrderBook(symbol: string) {
        const book = this.books.get(symbol);
        if(!book) return null;
        return book.getDepthSnapshot();
    }

    // Core Matching Logic 

    private matchOrder(order: Order, book: OrderBook): Trade[] {
        const trades: Trade[] = [];

        // Loop until this order is fully filled or no orders remain
        while(order.filledQty < order.quantity) {
            const remainingQty = order.quantity - order.filledQty;

            // Get the best opposing price
            const bestOpposingPrice = order.side === 'BUY'
            ? book.getBestAsk()
            : book.getBestBid();

            // No liquidity on the other side - stop matching
            if (bestOpposingPrice === null) break;

        // price compatibility check for limit orders
        // Buy limit:  I'm willing to pay up to order.price so ask must be <= that
        // Sell limit: i want at least order.price so bid must be >= that

        if(order.type === 'LIMIT') {
            if(order.side === 'BUY' && bestOpposingPrice > order.price) break;
            if(order.side === 'SELL' && bestOpposingPrice < order.price) break;
        }

        // Market order skip the price check - match at any price
        // Get the first order at that price level (FIFO - oldest order first)
        const opposingQueue = order.side === 'BUY' 
        ? book.getBidsAt(bestOpposingPrice)
        : book.getAsksAt(bestOpposingPrice);

        if(!opposingQueue || opposingQueue.length === 0) break;
        
        const restingOrder = opposingQueue[0];
        if (!restingOrder) break;

        // How much can we actually trade?
        const restingRemaining = restingOrder.quantity - restingOrder.filledQty;
        const tradeQty = Math.min(remainingQty, restingRemaining);

        // trade esecutes at the resting order's price
        // (the order already sitting in the book)
        const tradePrice = restingOrder.price;

        // BUild the trade record
        const trade: Trade = {
            id: uuidv4(),
            symbol: order.symbol,
            buyOrderId: order.side === 'BUY' ? order.id : restingOrder.id,
            sellOrderId: order.side === 'SELL' ? order.id : restingOrder.id,
            price: tradePrice,
            quantity: tradeQty,
            timestamp: Date.now()
        };

        trades.push(trade);

        // Update both orders
        order.filledQty += tradeQty;
        restingOrder.filledQty += tradeQty;

        if(restingOrder.filledQty >= restingOrder.quantity) {
            //Resting order fully filled - now remove from boook
            restingOrder.status = 'FILLED';
            book.cancelOrder(restingOrder.id, restingOrder.side, restingOrder.price);
        } else {
            // Resting order partially filled - stays in book
            restingOrder.status = 'PARTIALLY_FILLED';
        }

        if(order.filledQty >= order.quantity) {
            order.status = 'FILLED';
        }

        }
        return trades;
    }


}