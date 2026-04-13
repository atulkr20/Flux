import { Router, type Request, type Response } from 'express';
import engine from '../engine/index';

const router = Router();

// Return the current order book snapshot for a symbol
router.get('/:symbol', (req: Request, res: Response) => {
    const rawSymbol = req.params.symbol;
    const symbol = Array.isArray(rawSymbol) ? rawSymbol[0] : rawSymbol;

    if(!symbol) {
        res.status(400).json({ error: 'Missing symbol parameter' });
        return;
    }

    const book = engine.getOrderBook(symbol);

    if(!book) {
        res.status(404).json({ error: `No order book found for ${symbol}`});
        return;
    }

    res.status(200).json(book);
});

export default router;