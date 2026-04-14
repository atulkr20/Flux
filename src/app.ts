import express from 'express';
import fs from 'fs';
import path from 'path';
import ordersRouter from './routes/orders';
import orderbookRouter from './routes/orderbook';

const app = express();

app.use(express.json());

let staticDir = path.join(__dirname, 'public');

if (!fs.existsSync(staticDir)) {
	staticDir = path.join(__dirname, '../public');
}

app.use(express.static(staticDir));

// Mount the routes
app.use('/orders', ordersRouter);
app.use('/orderbook', orderbookRouter);

export default app;