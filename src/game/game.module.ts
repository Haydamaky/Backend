import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { GameController } from './game.controller';
import { GameRepository } from './game.repository';
import { GameRepositoryV2 } from './game.repository.v2';

@Module({
  providers: [
    GameService, 
    GameGateway, 
    GameRepository,
    GameRepositoryV2, 
  ],
  controllers: [GameController],
  exports: [GameService, GameRepository, GameRepositoryV2],
})
export class GameModule {}
