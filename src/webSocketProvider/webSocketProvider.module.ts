import { Module } from '@nestjs/common';
import { WebSocketProvider } from './webSocketProvider.service';

@Module({
  providers: [WebSocketProvider],
  exports: [WebSocketProvider],
})
export class WebSocketProviderModule {}
