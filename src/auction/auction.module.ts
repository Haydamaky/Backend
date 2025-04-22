import { forwardRef, Module } from '@nestjs/common';
import { AuctionService } from './auction.service';
import { GameModule } from 'src/game/game.module';
import { PlayerModule } from 'src/player/player.module';
import { TimerModule } from 'src/timer/timers.module';
import { FieldModule } from 'src/field/field.module';
import { WebSocketProviderModule } from 'src/webSocketProvider/webSocketProvider.module';

@Module({
  imports: [
    forwardRef(() => GameModule),
    forwardRef(() => PlayerModule),
    TimerModule,
    FieldModule,
    WebSocketProviderModule,
  ],
  providers: [AuctionService],
  exports: [AuctionService],
})
export class AuctionModule {}
