import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { JwtGuard } from './auth/guard/jwt.guard';
import { APP_GUARD } from '@nestjs/core';
import { ChatModule } from './chat/chat.module';
import { GameModule } from './game/game.module';
import { PlayerModule } from './player/player.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    UserModule,
    AuthModule,
    PrismaModule,
    ChatModule,
    GameModule,
    PlayerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
  ],
})
export class AppModule {}
