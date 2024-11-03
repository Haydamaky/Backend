import { Injectable } from '@nestjs/common';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { PlayerRepository } from './player.repository';
import { Prisma } from '@prisma/client';

@Injectable()
export class PlayerService {
  constructor(private playerRepository: PlayerRepository) {}
  create(createPlayerDto: CreatePlayerDto) {
    return this.playerRepository.create({
      data: { userId: createPlayerDto.userId, gameId: createPlayerDto.gameId },
      include: {
        game: {
          include: {
            players: { include: { user: { select: { nickname: true } } } },
          },
        },
      },
    });
  }

  findFirst(query: Prisma.PlayerFindManyArgs) {
    return this.playerRepository.findFirst(query);
  }

  deleteById(playerId: string) {
    return this.playerRepository.deleteById(playerId);
  }
}
