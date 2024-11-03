import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { GameController } from './game.controller';
import { GameRepository } from './game.repository';
import { UserModule } from 'src/user/user.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { PlayerModule } from 'src/player/player.module';

@Module({
  imports: [UserModule, JwtModule, ConfigModule, PlayerModule],
  controllers: [GameController],
  providers: [GameGateway, GameService, GameRepository],
})
export class GameModule {}
