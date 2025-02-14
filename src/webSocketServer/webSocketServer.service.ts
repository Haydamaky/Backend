import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class WebSocketServerService {
  public server: Server;

  setServer(server: Server) {
    this.server = server;
  }
}
