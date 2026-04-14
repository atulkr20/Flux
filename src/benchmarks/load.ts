import { MatchingEngine } from "../engine/MatchingEngine";
import { Order } from "../engine/types";
import {  v4 as uuidv4 } from 'uuid';

declare const process: { env: Record<string, string | undefined> };

const engine = new MatchingEngine();
const TOTAL_ORDERS = Number(process.env.BENCH_ORDERS ?? 100_000);
const SYMBOL = 'BTC-INR';

// Generating the orders upfront
// We do thsi before starting the tiimer so we're only measuring the engine

function generateOrders(): Order[] {
    const orders: Order[] = [];

    for(let i = 0; i < TOTAL_ORDERS; i++) {
        //  Alternate between buy and sell so we get actual matches
        const side = i % 2 === 0 ? 'BUY' : 'SELL';

        // Keeping prices in a narrow range so buys and sell actually cross
        const price = side === 'BUY'
        ? 1000 + Math.floor(Math.random() * 5) 
        : 1000 - Math.floor(Math.random() * 5);

        const order: Order ={
            id: uuidv4(),
            symbol: SYMBOL,
            side,
            type: 'LIMIT',
            price,
            quantity: Math.floor(Math.random() * 10) + 1,
            filledQty: 0,
            status: 'OPEN',
            createdAt: Date.now()

        };

        orders.push(order);
    }
    return orders;
}

// Run the Benchmark
async function run() {
    console.log(`\nGenerating ${TOTAL_ORDERS.toLocaleString()} orders...`);
    const orders = generateOrders();
    console.log('Done. Starting benchmark...\n');

    let totalTrades = 0;
    const latencies: number[] = [];

    // Start the overall timer
    const startTime = Date.now();

    for (let i = 0; i < orders.length; i++) {
        const order = orders[i]!;
        // Time each individual order
        const orderStart = performance.now();
        const trades = await engine.placeOrder(order);
        const orderEnd = performance.now();

        latencies.push(orderEnd - orderStart);
        totalTrades += trades.length;

        // Print progress every 1,000 orders so it doesn't feel stuck.
        if ((i + 1) % 1000 === 0) {
            console.log(`Processed ${i + 1}/${TOTAL_ORDERS} orders...`);
        }
    }

    const endTime = Date.now();

    //  Calculate  results
    const totalTimeSeconds = (endTime - startTime) / 1000;
    const ordersPerSecond = Math.floor(TOTAL_ORDERS / totalTimeSeconds);

    const avgLatencyMs = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3);
    const maxLatencyMs = Math.max(...latencies).toFixed(3);

    console.log(" FLUX BENCHMARK ");
    console.log(`Total orders : ${TOTAL_ORDERS.toLocaleString()}`);
    console.log(`Total trades : ${totalTrades.toLocaleString()}`);
    console.log(`Time taken : ${totalTimeSeconds.toFixed(2)}s` );
    console.log(`Orders/sec : ${ordersPerSecond.toLocaleString()}`);
    console.log(`Avg latency : ${avgLatencyMs}ms`);
    console.log(`Max latency : ${maxLatencyMs}ms`);
    console.log(`-------------------\n`);

    console.log('Resume bullet number:');
    console.log(`Benchmarked at ${ordersPerSecond.toLocaleString()} orders/sec\n`);

}

run();