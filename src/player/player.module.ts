import { forwardRef, Module } from '@nestjs/common';
import { PlayerService } from './player.service';
import { PlayerGateway } from './player.gateway';
import { PlayerRepository } from './player.repository';
import { UserModule } from 'src/user/user.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { GameModule } from 'src/game/game.module';
import { EventModule } from 'src/event/event.module';
import { WebSocketServerModule } from 'src/webSocketServer/webSocketServer.module';
import { ChatModule } from 'src/chat/chat.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Field, FieldSchema } from 'src/schema/Field.schema';
import { AuctionModule } from 'src/auction/auction.module';
import { TimerModule } from 'src/timer/timers.module';
@Module({
  imports: [
    forwardRef(() => GameModule),
    UserModule,
    JwtModule,
    ConfigModule,
    EventModule,
    WebSocketServerModule,
    ChatModule,
    forwardRef(() => AuctionModule),
    MongooseModule.forFeature([
      {
        name: Field.name,
        schema: FieldSchema,
      },
    ]),
    TimerModule,
  ],
  providers: [PlayerGateway, PlayerService, PlayerRepository],
  exports: [PlayerService],
})
export class PlayerModule {}
