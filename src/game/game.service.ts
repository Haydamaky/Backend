import { Injectable } from '@nestjs/common';
import { GameRepository } from './game.repository';
import { PlayerService } from 'src/player/player.service';

@Injectable()
export class GameService {
  constructor(
    private gameRepository: GameRepository,
    private playerService: PlayerService
  ) {}

  async getAllGames() {
    const games = await this.gameRepository.findMany({
      include: {
        players: { include: { user: { select: { nickname: true } } } },
      },
    });
    return games;
  }

  async joinGame(gameId: string, userId: string) {
    const game = await this.gameRepository.findFirst({
      where: { id: gameId },
      include: { players: true },
    });

    const filteredPlayers = game.players.filter(
      (player) => player.userId === userId
    );
    if (filteredPlayers.length) return null;

    const player = await this.playerService.create({ userId, gameId });
    return player.game;
  }

  async leaveGame(gameId: string, userId: string) {
    const player = await this.playerService.findFirst({
      where: { userId, gameId },
    });
    if (!player) return null;

    await this.playerService.deleteById(player.id);

    const game = await this.findGameWithPlayers(gameId);
    return game;
  }

  async findGameWithPlayers(gameId: string) {
    const game = await this.gameRepository.findFirst({
      where: { id: gameId },
      include: {
        players: { include: { user: { select: { nickname: true } } } },
      },
    });
    return game;
  }

  findById(gameId: string) {
    return this.gameRepository.findById(gameId);
  }
}
