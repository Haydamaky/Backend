import { Module } from '@nestjs/common';
import { TradeService } from './trade.service';
import { TradeGateway } from './trade.gateway';
import { GameModule } from 'src/game/game.module';
import { WebSocketProviderModule } from 'src/webSocketProvider/webSocketProvider.module';
import { FieldModule } from 'src/field/field.module';
import { ChatModule } from 'src/chat/chat.module';
import { TimerModule } from 'src/timer/timers.module';
import { PlayerModule } from 'src/player/player.module';
import { AuctionModule } from 'src/auction/auction.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    GameModule,
    WebSocketProviderModule,
    FieldModule,
    ChatModule,
    TimerModule,
    PlayerModule,
    AuctionModule,
    JwtModule,
    ConfigModule,
  ],
  providers: [TradeService, TradeGateway],
})
export class TradeModule {}
