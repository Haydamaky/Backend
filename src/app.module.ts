import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuctionModule } from './auction/auction.module';
import { AuthModule } from './auth/auth.module';
import { JwtGuard } from './auth/guard/jwt.guard';
import { ChatModule } from './chat/chat.module';
import { FieldModule } from './field/field.module';
import { GameModule } from './game/game.module';
import { PaymentModule } from './payment/payment.module';
import { PlayerModule } from './player/player.module';
import { PrismaModule } from './prisma/prisma.module';
import { SecretModule } from './secret/secret.module';
import { UserModule } from './user/user.module';
import { WebSocketProviderModule } from './webSocketProvider/webSocketProvider.module';
import { WebSocketProvider } from './webSocketProvider/webSocketProvider.service';
import { TradeModule } from './trade/trade.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    EventEmitterModule.forRoot(),
    UserModule,
    AuthModule,
    PrismaModule,
    ChatModule,
    GameModule,
    PlayerModule,
    WebSocketProviderModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('DATABASE_MONGO_URL'),
      }),
    }),
    AuctionModule,
    SecretModule,
    FieldModule,
    PaymentModule,
    TradeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
    WebSocketProvider,
  ],
})
export class AppModule {}
