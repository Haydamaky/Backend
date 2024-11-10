import { Module } from '@nestjs/common';
import { PlayerService } from './player.service';
import { PlayerGateway } from './player.gateway';
import { PlayerRepository } from './player.repository';

@Module({
  providers: [PlayerGateway, PlayerService, PlayerRepository],
  exports: [PlayerService],
})
export class PlayerModule {}
