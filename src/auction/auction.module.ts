import { Module } from '@nestjs/common';
import { AuctionService } from './auction.service';

@Module({
  providers: [AuctionService],
  exports: [AuctionService],
})
export class AuctionModule {}
