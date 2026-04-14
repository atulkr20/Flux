# Flux

A high-performance, in-memory crypto exchange matching engine built in TypeScript.

Supports **LIMIT, MARKET, and STOP orders** with price-time priority (PTIP), per-symbol mutex locking, stop order cascade triggering, real-time WebSocket depth streaming, and an AI-powered market summarizer via Groq.

---

## Tech Stack
Node.js · TypeScript · Express v5 · WebSocket (`ws`) · Groq LLM · async-mutex

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client                                │
│              HTTP              WebSocket                      │
└────────────────┬───────────────────┬────────────────────────┘
                 │                   │
         ┌───────▼───────┐   ┌───────▼───────┐
         │  REST Routes  │   │   WS Handler  │
         │  /orders      │   │  subscribe    │
         │  /orderbook   │   │  summarize    │
         └───────┬───────┘   └───────┬───────┘
                 │                   │
         ┌───────▼───────────────────▼───────┐
         │          Matching Engine           │
         │  ┌─────────────┐  ┌───────────┐  │
         │  │  OrderBook  │  │  Mutexes  │  │
         │  │  bids/asks  │  │ per-symbol│  │
         │  └─────────────┘  └───────────┘  │
         │  ┌─────────────────────────────┐  │
         │  │  Stop Order Queue           │  │
         │  │  (cascade trigger logic)    │  │
         │  └─────────────────────────────┘  │
         └───────────────────────────────────┘
                         │
                 ┌───────▼───────┐
                 │  Groq (LLM)   │
                 │  Summarizer   │
                 └───────────────┘
```

---

## Getting Started

```bash
git clone https://github.com/atulkr20/Flux.git
cd Flux
npm install
```

Create a `.env` file:
```env
GROQ_API_KEY=your_key_here
PORT=3000
```

```bash
npm run dev        # development
npm run build      # compile TypeScript
npm start          # run compiled build
npm run benchmark  # run 100k order load test
```

---

## API

**Place Order** — `POST /orders`
```json
{ "symbol": "BTC-INR", "side": "BUY", "type": "LIMIT", "price": 5000000, "quantity": 2 }
```

**Cancel Order** — `DELETE /orders/:id`
```json
{ "symbol": "BTC-INR", "side": "BUY", "price": 5000000 }
```

**Order Book Snapshot** — `GET /orderbook/:symbol`

---

## WebSocket

Connect to `ws://localhost:3000`

```json
{ "action": "subscribe", "symbol": "BTC-INR" }   // live depth updates
{ "action": "summarize", "symbol": "BTC-INR" }   // AI market summary (streamed)
```

---

## Benchmark

```
Total orders : 1,00,000
Total trades : 89,927
Time taken   : 0.24s
Orders/sec   : 4,23,728
Avg latency  : 0.002ms
Max latency  : 12.514ms
```

---

## Project Structure

```
src/
├── engine/       # Matching logic, OrderBook, types
├── routes/       # REST API endpoints
├── websocket/    # WebSocket server & broadcast
├── services/     # Groq AI summarizer
└── benchmarks/   # Load test script
```
