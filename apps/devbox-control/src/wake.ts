import { DurableObject } from 'cloudflare:workers';

export class RunnerWake extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send('wake');
        } catch {
          socket.close(1011, 'Wake failed');
        }
      }
      return new Response(null, { status: 204 });
    }
    if (
      request.method !== 'GET' ||
      request.headers.get('Upgrade') !== 'websocket'
    ) {
      return new Response(null, { status: 405 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (message === 'ping') socket.send('pong');
  }
}
