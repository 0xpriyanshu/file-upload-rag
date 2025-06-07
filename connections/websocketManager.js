import { WebSocketServer } from 'ws';

class WebSocketManager {
    // constructor(server) {
    //     this.clients = new Map(); // Using Map to store clients with optional identifiers
    //     this.setupServer(server);
    // }
    
    constructor() {
        this.clients = new Map();
    }

    // setupServer(server) {
    //     if (!server) return;

    //     // this.wss = new WebSocketServer({ server });

    //     // // Connection handler
    //     // this.wss.on('connection', (ws, request) => {
    //     //     console.log(request.headers);
    //     //     const clientId = request.headers['client-id'] || Date.now().toString();
    //     //     console.log(`Client connected: ${clientId}`);

    //     //     // Add to clients map
    //     //     this.clients.set(clientId, ws);

    //     //     // Setup message handler
    //     //     ws.on('message', (data) => this.handleMessage(clientId, data));

    //     //     // Setup close handler
    //     //     ws.on('close', () => {
    //     //         console.log(`Client disconnected: ${clientId}`);
    //     //         this.clients.delete(clientId);
    //     //     });

    //     //     // Setup error handler
    //     //     ws.on('error', (error) => {
    //     //         console.error(`Client error (${clientId}):`, error);
    //     //         this.clients.delete(clientId);
    //     //     });

    //     //     // Optional: Send welcome message
    //     //     this.sendToClient(clientId, { type: 'welcome', message: 'Connected to server' });
    //     // });
    // }

   

    handleMessage(clientId, data) {
        try {
            const message = JSON.parse(data);
            console.log(`Message from ${clientId}:`, message);

            // Add your custom message handling logic here
            // Example: Broadcast to all clients except sender
            if (message.type === 'chat') {
                this.broadcast({ type: 'chat', from: clientId, text: message.text }, clientId);
            }
        } catch (error) {
            console.error('Message parse error:', error);
        }
    }

    // Send to specific client
    sendToClient(clientId, message) {
        const ws = this.clients.get(clientId);
        // console.log("ws", ws);
        console.log("(ws && ws.readyState === WebSocketServer.OPEN)", (ws && ws.readyState === WebSocketServer.OPEN));
        console.log("ws.readyState", ws.readyState);
        console.log("WebSocketServer.OPEN", WebSocketServer.OPEN);
        if (ws && ws.readyState === WebSocketServer.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    // Broadcast to all clients (optional: exclude sender)
    broadcast(message, excludeClientId = null) {
        this.clients.forEach((ws, clientId) => {
            if (ws.readyState === WebSocketServer.OPEN && clientId !== excludeClientId) {
                ws.send(JSON.stringify(message));
            }
        });
    }

    getClientCount() {
        return this.clients.size;
    }

    // Graceful shutdown
    close() {
        this.wss?.close();
        this.clients.forEach(ws => ws.close());
    }
}

// Export a single instance
export const wsManager = new WebSocketManager();

export default WebSocketManager;