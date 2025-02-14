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

@Module({
  imports: [
    UserModule,
    JwtModule,
    ConfigModule,
    ChatModule,
    forwardRef(() => PlayerModule),
    EventModule,
    WebSocketServerModule,
  ],
  providers: [GameGateway, GameService, GameRepository],
  exports: [GameService],
})
export class GameModule {}
