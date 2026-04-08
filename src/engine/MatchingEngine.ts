import { Mutex } from 'async-mutex';
import { v4 as uuidv4 } from 'uuid';
import type { Order, Trade } from './types';
import { OrderBook } from './OrderBook';

export class MatchingEngine {
    // One order book per symbol
    private books: Map<string, OrderBook> = new Map();

    //One Mutex per symbol -- this prevents a race condition
    private mutexes: Map<string, Mutex> = new Map();
    
    // Stop orders not placed in orderbook immediately
    // Until the maket price hit their stopPrice they sit here in a Pending list

    private pendingStopOrders: Map<string, Order[]> = new Map();

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
        // acquire() pauses here until the mutex is free for this symbol
        const release = await mutex.acquire();

       try {
        // Stop orders don't enter the orderbook at all
        // they go into the pending list wnad wait for their stopPrice to hit
        if(order.type === 'STOP') {
            this.addToPendingStops(order);
            return []; // No trades yet the order is just waiting
        }

        const book = this.getOrCreateBook(order.symbol);
        const trades = this.matchOrder(order, book);

        // If this was a LIMIT order and it wasn't fully filled,
        // then the remaining quantity sits in the book waiting for a future match.
    
        if (order.type === 'LIMIT' && order.filledQty < order.quantity) {
            order.status = order.filledQty > 0 ? 'PARTIALLY_FILLED' : 'OPEN';
            book.addOrder(order);
        }

        // After every match, check if any stop orders got triggered
        // A stop order triggers when a trade happens at or past its stop price
        if (trades.length > 0) {
            const stoptrades = this.triggerStopOrders(order, Symbol, book, trades);
            trades.push(...stoptrades);
        }
        return trades;
       } finally {
        // The finally always runs and it guarantees the mutex is always released and never stays locked forever
        release();
       }

    }

    public cancelOrder(
        orderId: string,
        symbol: string,
        side: 'BUY' | 'SELL',
        price: number
    ): boolean {

        // First check the pending stop orders lsit for this symbol
        // Stop orders live here not in the order book
        const stops = this.pendingStopOrders.get(symbol);
        if (stops) {
            const stopIndex = this.pendingStopOrders.get(symbol);
            if(stops) {
                const stopIndex = stops.findIndex(o => o.id === orderId);
                if(stopIndex !== -1) {
                    stops.splice(stopIndex, 1);
                    return true;

                }
            }
            // if not found in pending stops, check the order book itself
            const book = this.books.get(symbol);
            if(!book) return false;
            return book.cancelOrder(orderId, side, price);

        }

        public getOrderBook(symbol: string) {
            const book = this.books.get(symbol);
            if(!book) return null;
            return book.getDepthSnapshot();
        }
        
    }

