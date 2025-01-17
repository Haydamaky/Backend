import { fields } from 'src/utils/fields';
import { FieldsType, FieldType } from '../utils/fields';
import { Injectable, Logger } from '@nestjs/common';
import { GamePayload, GameRepository } from './game.repository';
import { PlayerService } from 'src/player/player.service';
import { Player, Prisma } from '@prisma/client';
import { Auction } from './types/auction.type';
import { WsException } from '@nestjs/websockets';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { PromisesToWinBid } from './types/promisesToWinBid';

@Injectable()
export class GameService {
  constructor(
    private gameRepository: GameRepository,
    private playerService: PlayerService
  ) {}

  readonly PLAYING_FIELDS_QUANTITY = 40;
  private readonly MIN_RAISE = 100;

  private readonly logger = new Logger(GameService.name);
  timers: Map<string, NodeJS.Timeout> = new Map();
  auctions: Map<string, Auction> = new Map();
  promisesToWinBid: Map<string, PromisesToWinBid[]> = new Map();

  async getVisibleGames() {
    return this.gameRepository.findMany({
      where: { status: 'LOBBY' },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  async createGame(creator: JwtPayload) {
    const activePlayer = await this.gameRepository.findFirst({
      where: {
        OR: [{ status: 'LOBBY' }, { status: 'ACTIVE' }],
        players: {
          some: {
            userId: creator.sub,
          },
        },
      },
    });

    if (activePlayer) return null;

    return this.gameRepository.create({
      data: {
        playersCapacity: 4, // TODO change players capacity to dynamic number
        players: {
          create: {
            userId: creator.sub,
            color: this.playerService.COLORS[0],
          },
        },
        turnEnds: '10000',
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
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  async getGame(gameId: string) {
    return this.gameRepository.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: { user: { select: { nickname: true, id: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  async onJoinGame(gameId: string, userId: string) {
    const game = await this.gameRepository.findFirst({
      where: { id: gameId },
      include: {
        players: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
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
      const randomPlayerIndex = Math.floor(
        Math.random() * gameWithCreatedPlayer.players.length
      );
      const startedGame = await this.gameRepository.updateById(gameId, {
        data: {
          status: 'ACTIVE',
          turnOfUserId: gameWithCreatedPlayer.players[randomPlayerIndex].userId,
        },
        include: {
          players: {
            include: { user: { select: { nickname: true, id: true } } },
            orderBy: {
              createdAt: 'asc',
            },
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

  async findGameWithPlayers(gameId: string) {
    const game = await this.gameRepository.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
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

  setTimer<T, R>(
    id: string,
    time: number,
    args: T,
    callback: (args: T) => Promise<R>,
    promiseFns?: Record<string, any>
  ): Promise<R> {
    this.clearTimer(id);
    return new Promise<R>((resolve, reject) => {
      if (promiseFns) promiseFns.reject = reject;
      const timer = setTimeout(async () => {
        try {
          const res: R = await callback(args);
          resolve(res);
        } catch (err: any) {
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
    return this.findPlayerFieldByIndex(fields, player.currentFieldIndex);
  }

  async updateGameWithNewTurn(
    game: Partial<GamePayload>,
    timeOfTurn: number | null = null
  ) {
    const turnEnds = this.calculateEndOfTurn(
      timeOfTurn ? timeOfTurn : game.timeOfTurn
    );
    return this.updateById(game.id, {
      turnEnds,
    });
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
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  findPlayerByUserId(game: Partial<GamePayload>) {
    return game.players.find((player) => player.userId === game.turnOfUserId);
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
    const potentialNextIndex = currentIndex + dicesArr[0] + dicesArr[1];
    const resObj =
      potentialNextIndex > quantityOfElements
        ? {
            nextIndex: potentialNextIndex - quantityOfElements,
            shouldGetMoney: true,
          }
        : { nextIndex: potentialNextIndex, shouldGetMoney: false };
    return resObj;
  }

  findPlayerFieldByIndex(fields: FieldsType, indexOfField: number) {
    return fields.find((field) => field.index === indexOfField);
  }

  deletePlayer(players: Player[], idToDelete: string) {
    if (players.length === 0) return;
    const indexToDelete = players.findIndex(
      (player) => player.id === idToDelete
    );
    players.splice(indexToDelete, 1);
  }

  decrementPledgedFields(fields: FieldsType) {
    fields.forEach((field) => {
      if (field.isPledged && field.turnsToUnpledge === 0) {
        field.isPledged = false;
        field.ownedBy = '';
      } else if (field.isPledged) {
        field.turnsToUnpledge--;
      }
    });
  }

  async makeTurn(game: Partial<GamePayload>) {
    const dices = this.onRollDice();
    const turnEnds = this.calculateEndOfTurn(game.timeOfTurn);
    const currentPlayer = this.findPlayerByUserId(game);
    const dicesArr = this.parseDicesToArr(dices);
    const { nextIndex, shouldGetMoney } = this.calculateNextIndex(
      currentPlayer.currentFieldIndex,
      dicesArr,
      this.PLAYING_FIELDS_QUANTITY
    );
    this.decrementPledgedFields(fields);
    const updatedPlayer = await this.playerService.updateById(
      currentPlayer.id,
      {
        currentFieldIndex: nextIndex,
        money: { increment: shouldGetMoney ? game.passStartBonus : 0 },
      }
    );
    const updatedGame = await this.updateById(game.id, {
      dices,
      turnEnds,
    });
    const playerField = this.findPlayerFieldByIndex(
      fields,
      currentPlayer.currentFieldIndex
    );
    this.deletePlayer(playerField.players, currentPlayer.id);
    const playerNextField = this.findPlayerFieldByIndex(fields, nextIndex);
    playerNextField.players.push(updatedPlayer);
    return {
      updatedGame,
      fields,
      nextIndex,
      playerNextField,
      hasOwner: playerNextField?.ownedBy,
      currentPlayer,
    };
  }

  async findCurrentFieldWithUserId(game: Partial<GamePayload>) {
    const player = this.findPlayerByUserId(game);
    return this.findPlayerFieldByIndex(fields, player.currentFieldIndex);
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
    const bidder = { bid: field.price, userId: '' };
    this.setAuction(game.id, {
      fieldIndex: field.index,
      bidders: [bidder],
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
    const indexOfLast = auction.bidders.length - 1;
    let bid = auction.bidders[indexOfLast].bid;
    if (raiseBy !== 0) {
      bid += raiseBy;
    }
    auction.bidders[auction.bidders.length] = { userId, bid };
    this.setAuction(gameId, auction);
    return auction;
  }

  async raisePrice(gameId: string, userId: string, raiseBy: number) {
    const player = await this.playerService.findByUserAndGameId(userId, gameId);
    if (!player) throw new WsException('No such player');
    const auction = this.getAuction(gameId);
    if (!auction) throw new WsException('Auction wasn’t started');
    if (raiseBy < this.MIN_RAISE)
      throw new WsException('Raise is not big enough');
    if (player.money < auction.bidders[auction.bidders.length - 1].bid)
      throw new WsException('Not enough money');
    this.clearTimer(gameId);
    const promisesToWin = this.promisesToWinBid.get(gameId);
    if (promisesToWin.length >= player.game.players.length)
      throw new WsException('Wait for your bid to process');
    const allPromisesLess = promisesToWin.every((promiseObj) => {
      promiseObj.raiseBy < raiseBy;
    });
    if (allPromisesLess) {
      const promiseFns = { reject: null };
      const promiseToWinBid = this.setTimer(
        `${gameId}:${userId}`,
        2000,
        { gameId, userId, raiseBy },
        this.hightestInQueue,
        promiseFns
      );
      promisesToWin.forEach((promise) => {
        const wsException = new WsException(
          'there was a player with higher bid'
        );
        promise.reject(wsException);
        this.clearTimer(`${gameId}:${promise.userId}`);
      });
      this.promisesToWinBid.set(gameId, [
        {
          promise: promiseToWinBid,
          reject: promiseFns.reject,
          userId,
          raiseBy,
        },
      ]);
      return promiseToWinBid;
    } else {
      const promiseFns = { reject: null };
      const promiseToWinBid = this.setTimer(
        `${gameId}:${userId}`,
        2000,
        { gameId, userId, raiseBy },
        this.hightestInQueue,
        promiseFns
      );
      this.promisesToWinBid.set(gameId, [
        ...promisesToWin,
        {
          promise: promiseToWinBid,
          reject: promiseFns.reject,
          userId,
          raiseBy,
        },
      ]);
      return promiseToWinBid;
    }
  }

  async hightestInQueue(args: {
    gameId: string;
    userId: string;
    raiseBy: number;
  }) {
    const promisesToWin = this.promisesToWinBid.get(args.gameId);
    if (promisesToWin.length) {
      promisesToWin.forEach((promise) => {
        const wsException = new WsException(
          'there was a player with higher bid'
        );
        promise.reject(wsException);
        this.clearTimer(`${args.gameId}:${promise.userId}`);
      });
    }
    const auctionUpdated = this.setBuyerOnAuction(
      args.gameId,
      args.userId,
      args.raiseBy
    );
    const turnEnds = this.calculateEndOfTurn(5000);
    return { turnEnds, auctionUpdated };
  }

  async winAuction(auction: Auction & { gameId: string }) {
    const field = this.findPlayerFieldByIndex(fields, auction.fieldIndex);
    const lastBid = auction.bidders[auction.bidders.length - 1];
    field.ownedBy = lastBid.userId;
    const updatedPlayer =
      await this.playerService.decrementMoneyWithUserAndGameId(
        lastBid.userId,
        auction.gameId,
        lastBid.bid
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
      field.ownedBy === player.userId ||
      this.getAuction(game.id)
    ) {
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

  findPlayersWhoDidntLose(game: Partial<GamePayload>) {
    return game.players.filter((player) => !player.lost);
  }

  async passTurnToNext(game: Partial<GamePayload>) {
    const dices = '';
    this.setAuction(game.id, null);
    let { turnOfNextUserId } = this.findNextTurnUser(game);
    game.turnOfUserId = turnOfNextUserId;
    let playersNotLost = game.players.length;
    while (playersNotLost !== 1) {
      if (this.findPlayerByUserId(game).lost) {
        turnOfNextUserId = this.findNextTurnUser(game).turnOfNextUserId;
        game.turnOfUserId = turnOfNextUserId;
      } else {
        break;
      }
      --playersNotLost;
    }
    const turnEnds = this.calculateEndOfTurn(game.timeOfTurn);
    const updatedGame = await this.updateById(game.id, {
      turnOfUserId: turnOfNextUserId,
      dices,
      turnEnds,
    });
    return { updatedGame, turnEnds, turnOfNextUserId, dices };
  }

  async payForField(game: Partial<GamePayload>, playerNextField: FieldType) {
    const currentPlayer = this.findPlayerByUserId(game);

    if (
      currentPlayer.money <
      playerNextField.income[playerNextField.amountOfBranches]
    ) {
      // We can add pledging of last owned field or smt to not make player lose immidiately
      const updatedPlayer = await this.playerService.updateById(
        currentPlayer.id,
        { lost: true }
      );
      fields.forEach((field) => {
        if (field.ownedBy === updatedPlayer.userId) field.ownedBy = null;
      });
      return { updatedGame: updatedPlayer.game, fields };
    }

    await this.playerService.decrementMoneyWithUserAndGameId(
      game.turnOfUserId,
      game.id,
      playerNextField.income[playerNextField.amountOfBranches]
    );
    const received = await this.playerService.incrementMoneyWithUserAndGameId(
      playerNextField.ownedBy,
      game.id,
      playerNextField.income[playerNextField.amountOfBranches]
    );
    return { updatedGame: received.game };
  }

  hasWinner(game: Partial<GamePayload>) {
    const notLosers = this.findPlayersWhoDidntLose(game);
    return notLosers.length === 1;
  }
}
