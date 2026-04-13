import http from 'http';
import app from './app';
import { setupWebSocket } from './websocket/handler';

// this fix makes Node js prefer IPv4 when resolving domain names
// without this the groq api calls will fail with error as it did in NeuralProxy

import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

const PORT = process.env.PORT || 3000;

// we create an HTTP server manually insterad of using ap.listen()
// This is because WebSocket needs access to the same server instance

const server = http.createServer(app);

// Attach Websocket to the same server
setupWebSocket(server);

server.listen(PORT, () => {
    console.log(`Flux engine running on port ${PORT}`);
});