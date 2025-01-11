import { forwardRef, Module } from '@nestjs/common';
import { PlayerService } from './player.service';
import { PlayerGateway } from './player.gateway';
import { PlayerRepository } from './player.repository';
import { UserModule } from 'src/user/user.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { GameModule } from 'src/game/game.module';

@Module({
  imports: [forwardRef(() => GameModule), UserModule, JwtModule, ConfigModule],
  providers: [PlayerGateway, PlayerService, PlayerRepository],
  exports: [PlayerService],
})
export class PlayerModule {}
