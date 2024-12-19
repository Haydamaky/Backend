import { fields, FieldsType, FieldType } from './../utils/fields';
import { Injectable, Logger } from '@nestjs/common';
import { GamePayload, GameRepository } from './game.repository';
import { PlayerService } from 'src/player/player.service';
import { Prisma } from '@prisma/client';
import { Auction } from './types/auction.type';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';

@Injectable()
export class GameService {
  constructor(
    private gameRepository: GameRepository,
    private playerService: PlayerService
  ) {}

  readonly PLAYING_FIELDS_QUANTITY = 34;

  private readonly logger = new Logger(GameService.name);
  timers: Map<string, NodeJS.Timeout> = new Map();
  auctions: Map<string, Auction> = new Map();

  async getVisibleGames() {
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

  async createGame(creator: JwtPayload) {
    return this.gameRepository.create({
      data: {
        playersCapacity: 4, // TODO change players capacity to dynamic number
        players: {
          create: {
            userId: creator.sub,
            color: this.playerService.COLORS[0],
          },
        },
      },
      include: {
        players: {
          include: {
            user: {
              select: {
                nickname: true,
              },
            },
          },
        },
      },
    });
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
    const alreadyJoined = game.players.some(
      (player) => player.userId === userId
    );
    if (alreadyJoined || game.status !== 'LOBBY')
      return { game: null, shouldStart: false };
    const color = this.playerService.COLORS[game.players.length];
    const player = await this.playerService.create({
      color,
      userId,
      gameId,
    });
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

    const game = await this.getGame(gameId);
    return game;
  }

  async getGame(gameId: string) {
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
    id: string,
    time: number,
    args: unknown,
    callback: (args: unknown) => Promise<void>
  ) {
    this.clearTimer(id);
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(async () => {
        try {
          await callback(args);
          resolve();
        } catch (err) {
          console.log(err.message);
          reject(err);
        }
      }, time);
      this.timers.set(id, timer);

      this.logger.log(`Timer with id:${id} was set for ${time / 1000} seconds`);
    });
  }

  calculateEndOfTurn(timeOfTurn: number) {
    let turnEnds = Date.now();
    turnEnds += timeOfTurn;
    return turnEnds.toString();
  }

  async findCurrentFieldFromGame(game: Partial<GamePayload>) {
    const player = await this.playerService.findByUserAndGameId(
      game.turnOfUserId,
      game.id
    );
    const field = this.findPlayerFieldByIndex(fields, player.currentFieldIndex);
    return field;
  }

  async updateGameWithNewTurn(
    game: Partial<GamePayload>,
    timeOfTurn: number | null = null
  ) {
    const turnEnds = this.calculateEndOfTurn(
      timeOfTurn ? timeOfTurn : game.timeOfTurn
    );
    const updatedGame = await this.updateById(game.id, {
      turnEnds,
    });
    return updatedGame;
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

  clearTimer(gameId: string) {
    if (this.timers.has(gameId)) {
      const timer = this.timers.get(gameId);
      clearTimeout(timer);
      this.timers.delete(gameId);
      this.logger.log(`Cleared timer for game ${gameId}.`);
    }
  }

  async updateById(
    gameId: string,
    fieldsToUpdate: Partial<Prisma.$GamePayload['scalars']>
  ) {
    return this.gameRepository.updateById(gameId, {
      data: fieldsToUpdate,
      include: {
        players: { include: { user: { select: { nickname: true } } } },
      },
    });
  }

  findPlayerByUserId(game: Partial<GamePayload>) {
    const player = game.players.find(
      (player) => player.userId === game.turnOfUserId
    );
    return player;
  }

  parseDicesToArr(dices: string) {
    const dicesStringsArr = dices.split(':');
    return dicesStringsArr.map(Number);
  }

  calculateNextIndex(
    currentIndex: number,
    dicesArr: number[],
    quantityOfElements: number
  ) {
    let nextIndex = currentIndex + dicesArr[0] + dicesArr[1];
    return (nextIndex =
      nextIndex > quantityOfElements
        ? nextIndex - quantityOfElements
        : nextIndex);
  }

  findPlayerFieldByIndex(fields: FieldsType, indexOfField: number) {
    const playerField = fields.find((field) => field.index === indexOfField);
    return playerField;
  }

  deletePlayerId(playerIds: string[], idToDelete: string) {
    const indexToDelete = playerIds.findIndex(
      (playerId) => playerId === idToDelete
    );
    playerIds.splice(indexToDelete, 1);
  }

  async makeTurn(game: Partial<GamePayload>) {
    const dices = this.onRollDice();
    const turnEnds = this.calculateEndOfTurn(game.timeOfTurn);
    const updatedGame = await this.updateById(game.id, {
      dices,
      turnEnds,
    });
    const currentPlayer = this.findPlayerByUserId(game);
    const dicesArr = this.parseDicesToArr(dices);
    const nextIndex = this.calculateNextIndex(
      currentPlayer.currentFieldIndex,
      dicesArr,
      this.PLAYING_FIELDS_QUANTITY
    );
    const updatedPlayer = await this.playerService.updateById(
      currentPlayer.id,
      {
        currentFieldIndex: nextIndex,
      }
    );
    const playerField = this.findPlayerFieldByIndex(
      fields,
      currentPlayer.currentFieldIndex
    );
    this.deletePlayerId(playerField.players, currentPlayer.id);
    const playerNextField = this.findPlayerFieldByIndex(fields, nextIndex);
    playerNextField.players.push(updatedPlayer.id);
    return {
      updatedGame,
      fields,
      nextIndex,
      playerNextField,
      hasOwner: playerNextField.ownedBy,
    };
  }

  async findCurrentFieldWithUserId(game: Partial<GamePayload>) {
    const player = this.findPlayerByUserId(game);
    const playerField = this.findPlayerFieldByIndex(
      fields,
      player.currentFieldIndex
    );
    return playerField;
  }

  async putUpForAuction(game: Partial<GamePayload>) {
    const player = await this.playerService.findByUserAndGameId(
      game.turnOfUserId,
      game.id
    );
    if (!player) throw new WsException('No such player');
    const field = this.findPlayerFieldByIndex(fields, player.currentFieldIndex);
    if (!field.price)
      throw new WsException('You cant put this field to auction');
    this.setAuction(game.id, {
      fieldIndex: field.index,
      bid: field.price,
      userId: '',
    });
  }

  setAuction(gameId: string, auction: Auction) {
    this.auctions.set(gameId, auction);
  }

  getAuction(gameId: string) {
    return this.auctions.get(gameId);
  }

  setBuyerOnAuction(gameId: string, userId: string, raiseBy: number) {
    const auction = this.getAuction(gameId);
    auction.userId = userId;
    auction.bid += raiseBy;
    this.setAuction(gameId, auction);
    return auction;
  }

  async raisePrice(gameId: string, userId: string, raiseBy: number) {
    const player = await this.playerService.findByUserAndGameId(userId, gameId);
    if (!player) throw new WsException('No such player');
    const auction = this.getAuction(gameId);
    if (raiseBy < 100) throw new WsException('Raise is not big enough');
    if (!auction) throw new WsException('Auction wasn’t started');
    if (player.money < auction.bid) throw new WsException('Not enough money');
    this.clearTimer(gameId);
    const auctionUpdated = this.setBuyerOnAuction(gameId, userId, raiseBy);
    const turnEnds = this.calculateEndOfTurn(5000);
    return { turnEnds, auctionUpdated };
  }

  async winAuction(auction: Auction & { gameId: string }) {
    const field = this.findPlayerFieldByIndex(fields, auction.fieldIndex);
    field.ownedBy = auction.userId;
    const updatedPlayer =
      await this.playerService.decrementMoneyWithUserAndGameId(
        auction.userId,
        auction.gameId,
        auction.bid
      );
    this.setAuction(auction.gameId, null);
    return updatedPlayer;
  }

  async buyField(game: Partial<GamePayload>) {
    const player = this.findPlayerByUserId(game);
    const field = this.findPlayerFieldByIndex(fields, player.currentFieldIndex);
    if (
      !field.price ||
      field.price > player.money ||
      this.getAuction(game.id)
    ) {
      console.log({ field, auction: this.getAuction(game.id) });
      throw new WsException('You cant buy this field');
    }
    this.clearTimer(game.id);
    field.ownedBy = game.turnOfUserId;
    const updatedPlayer =
      await this.playerService.decrementMoneyWithUserAndGameId(
        game.turnOfUserId,
        game.id,
        field.price
      );
    return { updatedPlayer, field };
  }

  async passTurnToNext(game: Partial<GamePayload>) {
    const dices = '';
    this.setAuction(game.id, null);
    const turnEnds = this.calculateEndOfTurn(game.timeOfTurn);
    const { turnOfNextUserId } = this.findNextTurnUser(game);
    const updatedGame = await this.updateById(game.id, {
      turnOfUserId: turnOfNextUserId,
      dices,
      turnEnds,
    });
    return { updatedGame, turnEnds, turnOfNextUserId, dices };
  }

  async payForField(game: Partial<GamePayload>, playerNextField: FieldType) {
    const payed = await this.playerService.decrementMoneyWithUserAndGameId(
      game.turnOfUserId,
      game.id,
      playerNextField.incomeWithoutBranches
    );
    const received = await this.playerService.incrementMoneyWithUserAndGameId(
      playerNextField.ownedBy,
      game.id,
      playerNextField.incomeWithoutBranches
    );
    return { payed, received, updatedGame: received.game };
  }
}
