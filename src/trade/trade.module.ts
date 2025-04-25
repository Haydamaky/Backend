import { Module } from '@nestjs/common';
import { TradeService } from './trade.service';

@Module({
  providers: [TradeService],
})
export class TradeModule {}
