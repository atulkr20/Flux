export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET' | 'STOP';
export type OrderStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED';

export interface Order {
    id: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    price: number;
    quantity: number;
    filledQty: number;
    status: OrderStatus;

    createdAt: number;
    // We are adding createdAt so that when two users places an order at 
    // 500 then the user with older timestamp will get executed first
    // This is the TIME aspect of the engine
}

export interface Trade {
    id: string;
    symbol: string;
    buyOrderId: string;
    sellOrderId: string;
    price: number;
    quantity: number;
    timestamp: number;
}