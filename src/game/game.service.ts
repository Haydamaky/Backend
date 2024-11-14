import { Injectable, Logger } from '@nestjs/common';
import { GamePayload, GameRepository } from './game.repository';
import { PlayerService } from 'src/player/player.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class GameService {
  constructor(
    private gameRepository: GameRepository,
    private playerService: PlayerService
  ) {}

  private readonly logger = new Logger(GameService.name);
  rollTimers: Map<string, NodeJS.Timeout> = new Map();

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
        players: {
          include: { user: { select: { nickname: true, id: true } } },
        },
      },
    });
  }

  async onJoinGame(gameId: string, userId: string) {
    const game = await this.gameRepository.findFirst({
      where: { id: gameId },
      include: { players: true },
    });
    const filteredPlayers = game.players.filter(
      (player) => player.userId === userId
    );
    if (filteredPlayers.length || game.status === 'ACTIVE')
      return { game: null, shouldStart: false };

    const player = await this.playerService.create({ userId, gameId });
    const { game: gameWithCreatedPlayer } = player;
    if (
      gameWithCreatedPlayer.playersCapacity ===
      gameWithCreatedPlayer.players.length
    ) {
      const startedGame = await this.gameRepository.updateById(gameId, {
        data: {
          status: 'ACTIVE',
          turnOfUserId: gameWithCreatedPlayer.players[0].id,
        },
        include: {
          players: {
            include: { user: { select: { nickname: true, id: true } } },
          },
        },
      });
      return { game: startedGame, shouldStart: true };
    }
    return { game: gameWithCreatedPlayer, shouldStart: false };
  }

  async onLeaveGame(gameId: string, userId: string) {
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

  onRollDice() {
    const firstDice = Math.ceil(Math.random() * 6);
    const secondDice = Math.ceil(Math.random() * 6);
    return `${firstDice}:${secondDice}`;
  }

  setTimer(
    game: Partial<GamePayload>,
    rollDiceCallBack: (game: Partial<GamePayload>) => Promise<void>
  ) {
    this.clearRollTimer(game.id);
    const timer = setTimeout(function () {
      rollDiceCallBack(game);
    }, game.timeOfTurn);

    this.rollTimers.set(game.id, timer);

    this.logger.log(
      `User ${game.turnOfUserId} has 30 seconds to roll the dice in game ${game.id}.`
    );
  }

  calculateEndOfTurn(timeOfTurn: number) {
    let turnEnds = Date.now();
    turnEnds += timeOfTurn;
    return turnEnds.toString();
  }

  findNextTurnUser(game: Partial<GamePayload>) {
    const index = game.players.findIndex(
      (player) => player.userId === game.turnOfUserId
    );
    let nextIndex = index + 1;
    if (nextIndex === game.players.length) {
      nextIndex = 0;
    }
    const turnOfNextUserId = game.players[nextIndex].userId;
    return { turnOfNextUserId };
  }

  clearRollTimer(gameId: string) {
    if (this.rollTimers.has(gameId)) {
      const timer = this.rollTimers.get(gameId);
      clearTimeout(timer);
      this.rollTimers.delete(gameId);
      this.logger.log(`Cleared timer for game ${gameId}.`);
    }
  }

  async updateById(
    gameId: string,
    fieldsToUpdate: Partial<Prisma.$GamePayload['scalars']>
  ) {
    return this.gameRepository.updateById(gameId, {
      data: { ...fieldsToUpdate },
      include: {
        players: { include: { user: { select: { nickname: true } } } },
      },
    });
  }
}
