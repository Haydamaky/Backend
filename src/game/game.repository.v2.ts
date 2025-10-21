import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  GameWithRelations,
  GameWithPlayers,
  CreateGameData,
  StartGameData,
  GameInclude,
} from './types/game.types';
import { Game, Player, User, ChatType, Prisma } from '@prisma/client';

@Injectable()
export class GameRepositoryV2 {
  private readonly logger = new Logger(GameRepositoryV2.name);
  private readonly gameInclude: GameInclude = {
    players: {
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    },
    properties: true,
    currentPlayer: true,
    winner: true,
    chat: {
      select: {
        id: true,
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async getVisibleGames(): Promise<GameWithRelations[]> {
    try {
      return (await this.prisma.game.findMany({
        where: { status: 'LOBBY' },
        include: this.gameInclude,
      })) as unknown as GameWithRelations[];
    } catch (error) {
      this.logger.error('Failed to fetch visible games', error);
      throw new Error('Failed to fetch visible games');
    }
  }

  async createGameWithPlayer(
    userId: string,
    playersCapacity = 4
  ): Promise<GameWithRelations> {
    try {
      const data: CreateGameData = {
        playersCapacity,
        players: {
          create: {
            userId,
            color: '#000000',
          },
        },
        turnEnds: '10000',
      };

      return (await this.prisma.game.create({
        data,
        include: this.gameInclude,
      })) as unknown as GameWithRelations;
    } catch (error) {
      this.logger.error('Failed to create game with player', error);
      throw new Error('Failed to create game');
    }
  }

  async getGameById(gameId: string): Promise<GameWithRelations> {
    try {
      const game = (await this.prisma.game.findUnique({
        where: { id: gameId },
        include: this.gameInclude,
      })) as unknown as GameWithRelations;

      if (!game) {
        throw new NotFoundException(`Game with ID ${gameId} not found`);
      }

      return game;
    } catch (error) {
      this.logger.error(`Failed to fetch game ${gameId}`, error);
      throw error instanceof NotFoundException
        ? error
        : new Error('Failed to fetch game');
    }
  }

  async startGame(
    gameId: string,
    turnEnds: string
  ): Promise<GameWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const gameWithPlayers = await tx.game.findUnique({
        where: { id: gameId },
        include: {
          players: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!gameWithPlayers) {
        throw new NotFoundException(`Game with ID ${gameId} not found`);
      }

      if (gameWithPlayers.players.length < 2) {
        throw new Error('At least 2 players are required to start the game');
      }

      const firstPlayer =
        gameWithPlayers.players[gameWithPlayers.players.length - 1];

      const updateData: StartGameData = {
        status: 'ACTIVE',
        turnOfUserId: firstPlayer.userId,
        turnEnds,
        chat: {
          create: {
            type: ChatType.GAME,
            participants: {
              createMany: {
                data: gameWithPlayers.players.map((player) => ({
                  userId: player.userId,
                })),
              },
            },
          },
        },
      };

      return (await tx.game.update({
        where: { id: gameId },
        data: updateData,
        include: this.gameInclude,
      })) as unknown as GameWithRelations;
    });
  }

  async updateGame(
    gameId: string,
    data: Prisma.GameUpdateInput
  ): Promise<GameWithRelations> {
    try {
      return (await this.prisma.game.update({
        where: { id: gameId },
        data,
        include: this.gameInclude,
      })) as unknown as GameWithRelations;
    } catch (error) {
      this.logger.error(`Failed to update game ${gameId}`, error);
      throw new Error(`Failed to update game: ${error.message}`);
    }
  }

  async increaseHouses(
    gameId: string,
    quantity: number
  ): Promise<GameWithRelations> {
    return this.prisma.game.update({
      where: { id: gameId },
      data: { housesQty: { increment: quantity } },
      include: this.gameInclude,
    }) as unknown as GameWithRelations;
  }

  async decreaseHotels(
    gameId: string,
    quantity: number
  ): Promise<GameWithRelations> {
    return this.prisma.game.update({
      where: { id: gameId },
      data: { hotelsQty: { decrement: quantity } },
      include: this.gameInclude,
    }) as unknown as GameWithRelations;
  }

  async increaseHotels(
    gameId: string,
    quantity: number
  ): Promise<GameWithRelations> {
    return this.prisma.game.update({
      where: { id: gameId },
      data: { hotelsQty: { increment: quantity } },
      include: this.gameInclude,
    }) as unknown as GameWithRelations;
  }

  async decreaseHouses(
    gameId: string,
    quantity: number
  ): Promise<GameWithRelations> {
    return this.prisma.game.update({
      where: { id: gameId },
      data: { housesQty: { decrement: quantity } },
      include: this.gameInclude,
    }) as unknown as GameWithRelations;
  }
}
