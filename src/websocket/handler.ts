import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import engine from '../engine/index';

// we keep track of which clients are subscribed to which symbol
// Key: Symbol, value : set of websocket connections watching it 

const subscribers: Map<string, Set<WebSocket>> = new Map();

export function setupWebSocket(server: Server): void {
    
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket) => {
        console.log('New Webhook client connected');

        // When a message comes in from the client
        ws.on('message', (data) => {
            let parsed: any;

        // parse the incoming message as JSON, if malformed just ignore it
        try {
            parsed = JSON.parse(data.toString());
        } catch {
            ws.send(JSON.stringify({ error: 'Invalid JSON'}));
            return;
        }

        const { action, symbol } = parsed;

        if(action === 'subscribe' &&  symbol) {

            // Add this client to the subscriber list for this symbol
            if(!subscribers.has(symbol)) {
                subscribers.set(symbol, new Set());
            }

            subscribers.get(symbol)!.add(ws);

        // Send teh current book snapshot immediately so the client has somethign to show
        const book = engine.getOrderBook(symbol);
        ws.send(JSON.stringify({ type: 'snapshot', data: book }));

        console.log(`Client subscribed to $symbol`);


        }
        // Summarize (we'll do later)
        });

    // When a client sisconnects, remove them from all subscriber lists
    ws.on('close', () => {
        for (const [symbol, clients] of subscribers.entries()) {
            clients.delete(ws);


            // if no one is watching this symbol anymore, clean up the entry

            if(clients.size === 0) {
                subscribers.delete(symbol);
            }
        }
        console.log('Client disconnected');
    });
    });
}

// This functionis called from the orders route after every successful match 
// it broadcasts the updated orderbook to everyone watching that symbol

export function broadcastDepthupdate(symbol: string): void {
    const clients = subscribers.get(symbol);
    if(!clients || clients.size === 0) return;

    const book = engine.getOrderBook(symbol);
    const message = JSON.stringify({ type: 'depth_update', data: book });
    for(const client of clients) {
        // send only if the connection is still open
        if(client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}
