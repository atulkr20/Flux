import type { Order, OrderSide } from './types';


export class OrderBook {
    public symbol: string;


    // We are using a Map here to achieve 0(1) instant lookups 
    // A map lets us jump straight to the exact price.
    private bids: Map<number, Order[]>; //Buyers
    private asks: Map<number, Order[]>; //Sellers

    private bestBid: number | null;
    private bestAsk: number | null;

    constructor(symbol: string) {
        this.symbol = symbol;
        this.bids = new Map();
        this.asks = new Map();
        this.bestBid = null;
        this.bestAsk = null;
    }

    // Core Methods

    public addOrder(order: Order): void {
        const isBuy = order.side === 'BUY';
        const book = isBuy ? this.bids : this.asks;

        // If noone is at this proce yet, create a new empty array for it
        if(!book.has(order.price)) {
            book.set(order.price, []);
        }

        // we used the queue concept here using .push, this will push new orders at the end and the older order will stay at index 0
        book.get(order.price)?.push(order);
        this.updateBestPrices(order.price, isBuy);
    }

    public cancelOrder(orderId: string, side: OrderSide, price: number):boolean {
        const book = side === 'BUY' ? this.bids : this.asks;
        const orderQueue = book.get(price);

        if(!orderQueue) return false;

        // Finding specific order in the line
        const orderIndex = orderQueue.findIndex(order => order.id === orderId);
        if(orderIndex === -1) return false;

        // Remove the order from the array
        orderQueue.splice(orderIndex, 1);

        // if this was the last order at this price, delete the price level
         if(orderQueue.length ===0) {
            book.delete(price);

        // we just deleted the best price, now we must recalculate

        if(side === 'BUY' && price === this.bestBid) {
            this.reCalculateBestBid();
        } else if (side === 'SELL' && price === this.bestAsk) {
            this.reCalculateBestAsk();
        }

         }
         return true;

    }

    // Simple Getters
    public getBestBid(): number | null {
        return this.bestBid;
    }

    public getBestAsk(): number | null {
        return this.bestAsk;
    }

    // For Websocket and AI summarizer
    public getDepthSnapshot(){
        return {
            symbol: this.symbol,
            bestBid: this.bestBid,
            bestAsk: this.bestAsk,
            // Converting maps to standard objects so we can send them over HTTP/websockets safely
            bids: Object.fromEntries(this.bids),
            asks: Object.fromEntries(this.asks)
        };
    }

    // Internal Helper Methods

    private updateBestPrices(price: number, isBuy: boolean): void {
        if(isBuy) {
        // Buyers want to pay the least, But the engine will prioritize whoever pays the MOST
        if(this.bestBid === null || price > this.bestBid) {
            this.bestBid = price; // highest price wins
        }
        } else {
        // Seller want to charge the MOST, but the engine will prioritize whoever charges the LEAST
        if(this.bestAsk === null || price < this.bestAsk) {
            this.bestAsk = price;   // lowest price wins
        } 
        }
    }

    private reCalculateBestBid(): void {
        if(this.bids.size === 0) {
            this.bestBid = null;
            return;
        }

        // Using a simple for loop here bcz it's highly memory efficient

        let maxPrice = 0;
        for(const price of this.bids.keys()) {
            if(price > maxPrice) {
                maxPrice = price;
            }
        }
        this.bestBid = maxPrice;
    }

    public getBidsAt(price: number): Order[] | undefined {
        return this.bids.get(price);
    }

    public getAsksAt(price: number): Order[] | undefined {
        return this.asks.get(price);
    }

    private reCalculateBestAsk(): void {
        if (this.asks.size === 0) {
            this.bestAsk = null;
            return;
        }

        let minPrice = Infinity;
        for(const price of this.asks.keys()) {
            if(price < minPrice) {
                minPrice = price;
            }
        }
        this.bestAsk = minPrice;
    }
}