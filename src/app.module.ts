import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { JwtGuard } from './auth/guard/jwt.guard';
import { APP_GUARD } from '@nestjs/core';
import { ChatModule } from './chat/chat.module';
import { GameModule } from './game/game.module';
import { PlayerModule } from './player/player.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WebSocketServerModule } from './webSocketServer/webSocketServer.module';
import { WebSocketServerService } from './webSocketServer/webSocketServer.service';
import { MongooseModule } from '@nestjs/mongoose';

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
    WebSocketServerModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('DATABASE_MONGO_URL'),
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
    WebSocketServerService,
  ],
})
export class AppModule {}
