import express from 'express';
import path from 'path';
import ordersRouter from './routes/orders';
import orderbookRouter from './routes/orderbook';

const app = express();

app.use(express.json());

app.use(express.static(path.join(__dirname, '../public')));

// Mount the routes
app.use('/orders', ordersRouter);
app.use('/orderbook', orderbookRouter);

export default app;