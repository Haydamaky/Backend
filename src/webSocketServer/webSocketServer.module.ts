import { Module } from '@nestjs/common';
import { WebSocketServerService } from './webSocketServer.service';

@Module({
  providers: [WebSocketServerService],
  exports: [WebSocketServerService],
})
export class WebSocketServerModule {}
