import { Module } from '@nestjs/common';
import { TradeService } from './trade.service';
import { TradeGateway } from './trade.gateway';

@Module({
  providers: [TradeService, TradeGateway],
})
export class TradeModule {}
