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
@Module({
  imports: [
    forwardRef(() => GameModule),
    UserModule,
    JwtModule,
    ConfigModule,
    EventModule,
    WebSocketServerModule,
    ChatModule,
  ],
  providers: [PlayerGateway, PlayerService, PlayerRepository],
  exports: [PlayerService],
})
export class PlayerModule {}
