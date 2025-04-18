import { forwardRef, Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { GameRepository } from './game.repository';
import { UserModule } from 'src/user/user.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { PlayerModule } from 'src/player/player.module';
import { ChatModule } from 'src/chat/chat.module';
import { EventModule } from 'src/event/event.module';
import { WebSocketServerModule } from 'src/webSocketServer/webSocketServer.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Field, FieldSchema } from 'src/schema/Field.schema';
import { GameController } from './game.controller';
import { AuctionModule } from 'src/auction/auction.module';
import { TimerModule } from 'src/timer/timers.module';
import { SecretModule } from 'src/secret/secret.module';
import { PaymentModule } from 'src/payment/payment.module';
import { FieldModule } from 'src/field/field.module';

@Module({
  controllers: [GameController],
  imports: [
    UserModule,
    JwtModule,
    ConfigModule,
    ChatModule,
    forwardRef(() => PlayerModule),
    EventModule,
    forwardRef(() => AuctionModule),
    TimerModule,
    forwardRef(() => SecretModule),
    PaymentModule,
    FieldModule,
  ],
  providers: [GameGateway, GameService, GameRepository],
  exports: [GameService],
})
export class GameModule {}
