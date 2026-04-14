# Flux ⚡

A high-performance, in-memory crypto exchange matching engine built in TypeScript. Flux implements real exchange mechanics — price-time priority (PTIP), concurrent order processing with mutex locks, stop order cascade triggering, and real-time WebSocket depth streaming — all backed by an AI-powered market summarizer.

---

## Features

- **LIMIT, MARKET & STOP orders** — full order type support with correct fill semantics
- **Price-Time Priority (PTIP)** — best bid/ask matching with FIFO fairness at equal prices
- **Concurrency-safe** — per-symbol mutex locks prevent race conditions under load
- **Stop Order Cascades** — triggered stops convert to market orders and can recursively trigger further stops
- **Real-time WebSocket streaming** — clients subscribe per-symbol and receive live depth updates on every match
- **AI Market Summarizer** — streams a Groq LLM (llama-3.1-8b) analysis of the current order book state over WebSocket
- **Multi-symbol support** — order books and locks are created on-demand per trading pair (e.g. `BTC-INR`, `ETH-INR`)
- **Load benchmark** — ships with a 100,000-order benchmark script with per-order latency stats

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

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| HTTP Server | Express v5 |
| WebSocket | `ws` |
| Concurrency | `async-mutex` |
| AI Integration | Groq API (OpenAI-compatible SDK) |
| IDs | `uuid` v4 |

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Groq API key](https://console.groq.com) (free tier available)

### Installation

```bash
git clone https://github.com/atulkr20/Flux.git
cd Flux
npm install
```

### Environment Setup

Create a `.env` file in the root:

```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant   # optional, this is the default
PORT=3000                          # optional, defaults to 3000
```

### Run

```bash
# Development (with live reload via ts-node)
npm run dev

# Production build
npm run build
npm start
```

---

## API Reference

### Place an Order

```
POST /orders
```

**Body:**

```json
{
  "symbol": "BTC-INR",
  "side": "BUY",
  "type": "LIMIT",
  "price": 5000000,
  "quantity": 2
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | ✅ | e.g. `BTC-INR` |
| `side` | `"BUY"` \| `"SELL"` | ✅ | |
| `type` | `"LIMIT"` \| `"MARKET"` \| `"STOP"` | ✅ | |
| `price` | number | For LIMIT/STOP | |
| `quantity` | number | ✅ | |
| `stopPrice` | number | For STOP orders | Trigger price |

**Response:**

```json
{
  "orderId": "uuid",
  "status": "PARTIALLY_FILLED",
  "trades": [
    {
      "id": "uuid",
      "symbol": "BTC-INR",
      "buyOrderId": "uuid",
      "sellOrderId": "uuid",
      "price": 4999000,
      "quantity": 1,
      "timestamp": 1713000000000
    }
  ]
}
```

---

### Cancel an Order

```
DELETE /orders/:id
```

**Body:**

```json
{
  "symbol": "BTC-INR",
  "side": "BUY",
  "price": 5000000
}
```

---

### Get Order Book Snapshot

```
GET /orderbook/:symbol
```

**Response:**

```json
{
  "symbol": "BTC-INR",
  "bestBid": 4999000,
  "bestAsk": 5000000,
  "bids": { "4999000": [...], "4998000": [...] },
  "asks": { "5000000": [...], "5001000": [...] }
}
```

---

## WebSocket API

Connect to `ws://localhost:3000`.

### Subscribe to Depth Updates

```json
{ "action": "subscribe", "symbol": "BTC-INR" }
```

You'll receive:
- An immediate `snapshot` of the current book
- A `depth_update` pushed every time a trade executes for that symbol

### Stream AI Market Summary

```json
{ "action": "summarize", "symbol": "BTC-INR" }
```

You'll receive a stream of `summary_chunk` messages followed by `summary_done`:

```json
{ "type": "summary_chunk", "text": "The BTC-INR order book shows..." }
{ "type": "summary_done" }
```

---

## Benchmark

Run the built-in load test (100,000 orders by default):

```bash
npm run benchmark
```

To customize the order count:

```bash
BENCH_ORDERS=500000 npm run benchmark
```

**Sample output:**
```
FLUX BENCHMARK
Total orders : 1,00,000
Total trades : 89,927
Time taken   : 0.24s
Orders/sec   : 4,23,728
Avg latency  : 0.002ms
Max latency  : 12.514ms
```

---

## How Matching Works

1. **LIMIT orders** are matched against the best opposite price. If unfilled or partially filled, the remainder is added to the book.
2. **MARKET orders** match at whatever price is available. They never rest in the book.
3. **STOP orders** park in a pending queue. When a trade executes and the last trade price crosses the stop's trigger price, the stop converts to a MARKET order and executes immediately — this can cascade recursively.

Price-time priority is enforced: among orders at the same price, the oldest order (by `createdAt`) is matched first.

---

## Project Structure

```
src/
├── engine/
│   ├── MatchingEngine.ts   # Core matching logic, mutex management, stop cascades
│   ├── OrderBook.ts        # Per-symbol bid/ask maps with best price tracking
│   ├── types.ts            # Order, Trade, OrderSide, OrderStatus types
│   └── index.ts            # Singleton engine export
├── routes/
│   ├── orders.ts           # POST /orders, DELETE /orders/:id
│   └── orderbook.ts        # GET /orderbook/:symbol
├── websocket/
│   └── handler.ts          # WS server, subscribe/summarize logic, broadcast
├── services/
│   └── summarizer.service.ts # Groq streaming integration
├── benchmarks/
│   └── load.ts             # 100k order load test with latency stats
├── app.ts                  # Express app setup
└── server.ts               # HTTP server + WebSocket attach
```

---

## License

ISC
