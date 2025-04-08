import { forwardRef, Module } from '@nestjs/common';
import { AuctionService } from './auction.service';
import { GameModule } from 'src/game/game.module';
import { PlayerModule } from 'src/player/player.module';
import { TimerModule } from 'src/timer/timers.module';

@Module({
  imports: [
    forwardRef(() => GameModule),
    forwardRef(() => PlayerModule),
    TimerModule,
  ],
  providers: [AuctionService],
  exports: [AuctionService],
})
export class AuctionModule {}
