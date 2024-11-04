import { Injectable } from '@nestjs/common';
import { GameRepository } from './game.repository';
import { PlayerService } from 'src/player/player.service';

@Injectable()
export class GameService {
  constructor(
    private gameRepository: GameRepository,
    private playerService: PlayerService
  ) {}

  async getAllVisibleGames() {
    const games = await this.gameRepository.findMany({
      where: { status: 'LOBBY' },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
        },
      },
    });
    return games;
  }

  async getCurrentGame(gameId: string) {
    return this.gameRepository.findFirst({
      where: { id: gameId },
      include: {
        players: { include: { user: { select: { nickname: true } } } },
      },
    });
  }

  async joinGame(gameId: string, userId: string) {
    const game = await this.gameRepository.findFirst({
      where: { id: gameId },
      include: { players: true },
    });

    const filteredPlayers = game.players.filter(
      (player) => player.userId === userId
    );
    if (filteredPlayers.length || game.status === 'ACTIVE') return null;

    const player = await this.playerService.create({ userId, gameId });
    const { game: updatedGame } = player;
    if (updatedGame.playersCapacity === updatedGame.players.length) {
      await this.gameRepository.updateById(gameId, {
        data: { status: 'ACTIVE' },
      });
      return { game: updatedGame, shouldStart: true };
    }
    return { game: updatedGame, shouldStart: false };
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
