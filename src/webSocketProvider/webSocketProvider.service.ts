import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class WebSocketProvider {
  private _server: Server | null = null;

  setServer(server: Server) {
    this._server = server;
  }

  get server(): Server {
    if (!this._server) {
      throw new Error('WebSocket server is not initialized');
    }
    return this._server;
  }
}
