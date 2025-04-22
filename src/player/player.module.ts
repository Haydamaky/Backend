import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuctionModule } from 'src/auction/auction.module';
import { ChatModule } from 'src/chat/chat.module';
import { EventModule } from 'src/event/event.module';
import { FieldModule } from 'src/field/field.module';
import { GameModule } from 'src/game/game.module';
import { TimerModule } from 'src/timer/timers.module';
import { UserModule } from 'src/user/user.module';
import { PlayerGateway } from './player.gateway';
import { PlayerRepository } from './player.repository';
import { PlayerService } from './player.service';
import { WebSocketProviderModule } from 'src/webSocketProvider/webSocketProvider.module';
@Module({
  imports: [
    forwardRef(() => GameModule),
    UserModule,
    JwtModule,
    ConfigModule,
    EventModule,
    WebSocketProviderModule,
    ChatModule,
    forwardRef(() => AuctionModule),
    FieldModule,
    TimerModule,
  ],
  providers: [PlayerGateway, PlayerService, PlayerRepository],
  exports: [PlayerService],
})
export class PlayerModule {}
