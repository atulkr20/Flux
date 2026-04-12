import { Router } from "express";
import type { Request, Response } from "express";
import { v4 as uuidv4 } from 'uuid';
import engine from '../engine/index';
import type { Order } from "../engine/types";

const router = Router();

router.post('/', async (req: Request, res: Response) => {
    const { symbol, side, type, price, quantity, stopPrice } = req.body;

    if(!symbol || !side || !type || !quantity) {
        res.status(400).json({ error: 'Symbol, side, type and quantity are required'});
        return;

    }

    // Build the order object
    const order: Order = {
        id: uuidv4(),
        symbol,
        side,
        type,
        price: price ?? 0,  // MArket orders don't have a price pso by default 0
        stopPrice,
        quantity,
        filledQty: 0,
        status: 'OPEN',
        createdAt: Date.now()
    };

    const trades = await engine.placeOrder(order);

    res.status(201).json({
        orderId: order.id,
        status: order.status,
        trades  // returning "trades" so the caller knows what matched immediately
    });
});

// Cancel an existing order
router.delete('/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const { symbol, side, price } = req.body;
    const parsedPrice = Number(price);
    const orderId = typeof id === 'string' ? id : undefined;
    const symbolValue = typeof symbol === 'string' ? symbol : undefined;
    const sideValue = side === 'BUY' || side === 'SELL' ? side : undefined;

    if(!orderId || !symbolValue || !sideValue || !Number.isFinite(parsedPrice)) {
        res.status(400).json({ error: 'Symbol, side and price are required in body'});
        return;
    }

    const cancelled = engine.cancelOrder(orderId, symbolValue, sideValue, parsedPrice);

    if(!cancelled) {
        res.status(404).json({ error: 'Order not  found'});
        return;
    }

    res.status(200).json({ message: 'Orde cancelled'});


});

export default router;