import { DEFAULT_FIELDS } from 'src/utils/fields';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { GamePayload, GameRepository } from './game.repository';
import { PlayerService } from 'src/player/player.service';
import { ChatType, Player, Prisma } from '@prisma/client';
import { Auction } from './types/auction.type';
import { WsException } from '@nestjs/websockets';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { PromisesToWinBid } from './types/promisesToWinBid';
import { Mutex } from 'async-mutex';
import secretFields, { SecretType } from 'src/utils/fields/secretFields';
import { SecretInfo } from './types/secretInfo.type';
import { EventService } from 'src/event/event.service';
import { InjectModel } from '@nestjs/mongoose';
import { Field, FieldDocument } from 'src/schema/Field.schema';
import { Model } from 'mongoose';
@Injectable()
export class GameService {
  constructor(
    private gameRepository: GameRepository,
    @Inject(forwardRef(() => PlayerService))
    private playerService: PlayerService,
    private eventService: EventService,
    @InjectModel(Field.name) private fieldModel: Model<Field>
  ) {
    this.hightestInQueue = this.hightestInQueue.bind(this);
    this.passTurnToUser = this.passTurnToUser.bind(this);
  }

  readonly PLAYING_FIELDS_QUANTITY = 40;
  private readonly MIN_RAISE = 100;

  private readonly logger = new Logger(GameService.name);
  timers: Map<string, NodeJS.Timeout> = new Map();
  auctions: Map<string, Auction> = new Map();
  promisesToWinBid: Map<string, PromisesToWinBid[]> = new Map();
  private readonly auctionMutexes: Map<string, Mutex> = new Map();
  readonly secrets: Map<string, SecretInfo> = new Map();

  private getMutex(gameId: string): Mutex {
    if (!this.auctionMutexes.has(gameId)) {
      this.auctionMutexes.set(gameId, new Mutex());
    }
    return this.auctionMutexes.get(gameId)!;
  }

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
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  async createGame(userId: string) {
    const activePlayer = await this.gameRepository.findFirst({
      where: {
        OR: [{ status: 'LOBBY' }, { status: 'ACTIVE' }],
        players: {
          some: {
            userId,
          },
        },
      },
    });

    if (activePlayer) return null;
    const newGame = await this.gameRepository.create({
      data: {
        playersCapacity: 4, // TODO change players capacity to dynamic number
        players: {
          create: {
            userId,
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
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
    const gameFields = DEFAULT_FIELDS.map((field) => ({
      ...field,
      gameId: newGame.id,
    }));

    await this.fieldModel.insertMany(gameFields);
    return newGame;
  }

  async getGameFields(gameId: string) {
    return await this.fieldModel.find({ gameId });
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
        chat: {
          select: {
            id: true,
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
        chat: {
          select: {
            id: true,
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
      const turnEnds = this.calculateEndOfTurn(game.timeOfTurn);
      const startedGame = await this.gameRepository.updateById(gameId, {
        data: {
          status: 'ACTIVE',
          turnOfUserId:
            gameWithCreatedPlayer.players[
              gameWithCreatedPlayer.players.length - 1
            ].userId,
          turnEnds,
          chat: {
            create: {
              type: ChatType.GAME,
              participants: {
                createMany: {
                  data: [
                    ...gameWithCreatedPlayer.players.map((player) => ({
                      userId: player.userId,
                    })),
                  ],
                },
              },
            },
          },
        },
        include: {
          players: {
            include: { user: { select: { nickname: true, id: true } } },
            orderBy: {
              createdAt: 'asc',
            },
          },
          chat: {
            select: {
              id: true,
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
        chat: {
          select: {
            id: true,
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
          console.log('In Timer');
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
    const fields = await this.getGameFields(game.id);
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
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
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

  findPlayerFieldByIndex(fields: FieldDocument[], indexOfField: number) {
    return fields.find((field) => field.index === indexOfField);
  }

  async decrementPledgedFields(fields: FieldDocument[]) {
    fields.forEach((field) => {
      if (field.isPledged && field.turnsToUnpledge === 0) {
        field.isPledged = false;
        field.ownedBy = '';
      } else if (field.isPledged) {
        field.turnsToUnpledge--;
      }
    });
    await this.updateFields(fields, [
      'isPledged',
      'ownedBy',
      'turnsToUnpledge',
    ]);
  }

  async updateFields<T extends FieldDocument>(
    fields: T[],
    propertiesToUpdate: string[]
  ): Promise<void> {
    const updates = fields.map((field) => {
      const updateFields: any = {};

      for (const property of propertiesToUpdate) {
        if (field[property] !== undefined) {
          updateFields[property] = field[property];
        }
      }

      return {
        updateOne: {
          filter: { _id: field._id },
          update: { $set: updateFields },
        },
      };
    });
    await this.fieldModel.bulkWrite(updates);
  }

  async makeTurn(game: Partial<GamePayload>) {
    const dices = this.onRollDice();

    const currentPlayer = this.playerService.findPlayerWithTurn(game);
    const dicesArr = this.parseDicesToArr(dices);
    const fields = await this.getGameFields(game.id);
    const { nextIndex, shouldGetMoney } = this.calculateNextIndex(
      currentPlayer.currentFieldIndex,
      dicesArr,
      this.PLAYING_FIELDS_QUANTITY
    );
    this.decrementPledgedFields(fields);
    await this.playerService.updateById(currentPlayer.id, {
      currentFieldIndex: nextIndex,
      money: { increment: shouldGetMoney ? game.passStartBonus : 0 },
    });

    const playerNextField = this.findPlayerFieldByIndex(fields, nextIndex);
    let updatedGame: null | Partial<GamePayload> = null;
    if (playerNextField.ownedBy !== currentPlayer.userId) {
      const turnEnds = this.calculateEndOfTurn(game.timeOfTurn);
      updatedGame = await this.updateById(game.id, {
        dices,
        turnEnds,
      });
    } else {
      updatedGame = await this.updateById(game.id, {
        dices,
      });
    }
    return {
      updatedGame,
      fields,
      nextIndex,
      playerNextField,
      hasOwner: playerNextField?.ownedBy,
      currentPlayer,
    };
  }

  getRandomSecret() {
    const randomSecretIndex = Math.floor(Math.random() * secretFields.length);
    return secretFields[randomSecretIndex];
  }

  async parseAndSaveSecret(secret: SecretType, game: Partial<GamePayload>) {
    if (secret.numOfPlayersInvolved === 'one') {
      const secretInfo = {
        amounts: secret.amounts,
        users: [game.turnOfUserId],
      };
      this.secrets.set(game.id, secretInfo);
      return secretInfo;
    } else if (secret.numOfPlayersInvolved === 'two') {
      const playersWithoutActive = game.players.filter(
        (player) => player.userId !== game.turnOfUserId && !player.lost
      );
      const randomUserId = this.getRandomPlayersUserId(playersWithoutActive);
      const secretInfo = {
        amounts: secret.amounts,
        users: [game.turnOfUserId, randomUserId],
      };
      this.secrets.set(game.id, secretInfo);
      return secretInfo;
    } else if (secret.numOfPlayersInvolved === 'all') {
      const secretInfo = {
        amounts: secret.amounts,
        users: [
          game.turnOfUserId,
          ...game.players
            .filter((player) => player.userId !== game.turnOfUserId)
            .map((player) => {
              if (!player.lost && player.userId !== game.turnOfUserId) {
                return player.userId;
              }
              return '';
            }),
        ],
      };
      this.secrets.set(game.id, secretInfo);
      return secretInfo;
    }
  }

  getRandomPlayersUserId(players: Partial<Player[]>) {
    const randomIndex = Math.floor(Math.random() * players.length);
    return players[randomIndex].userId;
  }

  async findCurrentFieldWithUserId(game: Partial<GamePayload>) {
    const player = this.playerService.findPlayerWithTurn(game);
    const fields = await this.getGameFields(game.id);
    return this.findPlayerFieldByIndex(fields, player.currentFieldIndex);
  }

  async putUpForAuction(game: Partial<GamePayload>) {
    const player = await this.playerService.findByUserAndGameId(
      game.turnOfUserId,
      game.id
    );
    const fields = await this.getGameFields(game.id);
    if (!player) throw new WsException('No such player');
    const field = this.findPlayerFieldByIndex(fields, player.currentFieldIndex);
    if (!field.price)
      throw new WsException('You cant put this field to auction');
    this.clearTimer(game.id);
    const bidder = { bid: field.price, userId: '', accepted: true };
    const turnEnds = this.calculateEndOfTurn(15000);
    this.setAuction(game.id, {
      fieldIndex: field.index,
      bidders: [bidder],
      turnEnds,
      usersRefused: [game.turnOfUserId],
    });
    return this.getAuction(game.id);
  }

  setAuction(gameId: string, auction: Auction) {
    this.auctions.set(gameId, auction);
  }

  getAuction(gameId: string) {
    return this.auctions.get(gameId);
  }

  setBuyerOnAuction(
    gameId: string,
    userId: string,
    raiseBy: number,
    accepted: boolean
  ) {
    const auction = this.getAuction(gameId);
    const indexOfLastOfAccepted = auction.bidders.findLastIndex((bidder) => {
      return bidder.accepted && bidder.bid;
    });
    let bid = auction.bidders[indexOfLastOfAccepted].bid;
    if (raiseBy !== 0) {
      bid += raiseBy;
    }
    const turnEnds = this.calculateEndOfTurn(15000);
    auction.bidders[auction.bidders.length] = { userId, bid, accepted };
    auction.turnEnds = turnEnds;
    this.setAuction(gameId, auction);
    return auction;
  }

  async raisePrice(gameId: string, userId: string, raiseBy: number) {
    const mutex = this.getMutex(gameId);
    const release = await mutex.acquire();
    try {
      const player = await this.playerService.findByUserAndGameId(
        userId,
        gameId
      );
      if (!player) throw new WsException('No such player');
      const auction = this.getAuction(gameId);
      if (!auction) throw new WsException('Auction wasn’t started');
      if (raiseBy < this.MIN_RAISE)
        throw new WsException('Raise is not big enough');
      if (auction.usersRefused.includes(userId))
        throw new WsException('You refused to auction');
      if (
        player.money <
        auction.bidders[
          auction.bidders.findLastIndex((bidder) => {
            return bidder.accepted && bidder.bid;
          })
        ].bid
      )
        throw new WsException('Not enough money');
      this.clearTimer(gameId);
      const promisesToWin = this.promisesToWinBid.get(gameId) || [];
      const currentUserPromise = promisesToWin.filter(
        (promise) => promise.userId === userId
      );
      if (currentUserPromise.length)
        throw new WsException('Wait for bids to process');
      const allPromisesLess = promisesToWin.every((promiseObj) => {
        return promiseObj.raiseBy < raiseBy;
      });
      const allPromisesEqual = promisesToWin.every((promiseObj) => {
        return promiseObj.raiseBy === raiseBy;
      });
      if (!allPromisesLess && !allPromisesEqual)
        throw new WsException('Your bid is too small');
      if (allPromisesLess) {
        promisesToWin.forEach((promise) => {
          promise.reject(auction);
          this.clearTimer(`${gameId}:${promise.userId}`);
          this.setBuyerOnAuction(
            gameId,
            promise.userId,
            promise.raiseBy,
            false
          );
        });
        const promiseFns = { reject: null };
        const promiseToWinBid = this.setTimer(
          `${gameId}:${userId}`,
          200,
          { gameId, userId, raiseBy },
          this.hightestInQueue,
          promiseFns
        );

        this.promisesToWinBid.set(gameId, [
          {
            promise: promiseToWinBid,
            reject: promiseFns.reject,
            userId,
            raiseBy,
          },
        ]);
        return promiseToWinBid;
      } else if (allPromisesEqual) {
        const promiseFns = { reject: null };
        const promiseToWinBid = this.setTimer(
          `${gameId}:${userId}`,
          200,
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
    } finally {
      release();
    }
  }

  async refuseAuction(gameId: string, userId: string) {
    const mutex = this.getMutex(gameId);
    const release = await mutex.acquire();
    try {
      const player = await this.playerService.findByUserAndGameId(
        userId,
        gameId
      );
      if (!player) throw new WsException('No such player');
      const auction = this.getAuction(gameId);
      if (!auction) throw new WsException('Auction wasn’t started');
      const indexOfLastOfAccepted = auction.bidders.findLastIndex((bidder) => {
        return bidder.accepted && bidder.bid;
      });
      if (userId === auction.bidders[indexOfLastOfAccepted].userId) {
        throw new WsException('You are the last bidder');
      }
      const promisesToWin = this.promisesToWinBid.get(gameId) || [];
      const stillCanWindBid = promisesToWin.some(
        (promise) => promise.userId === userId
      );
      if (stillCanWindBid) {
        throw new WsException('Wait for bids to process');
      }
      if (auction.usersRefused.includes(userId))
        throw new WsException('You already refused to auction');
      auction.usersRefused.push(userId);
      auction.bidders.push({ accepted: false, bid: 0, userId });
      if (
        auction.usersRefused.length >=
          player.game.players.filter((player) => !player.lost).length &&
        auction.bidders.findLastIndex((bidder) => {
          return bidder.accepted && bidder.bid;
        }) > -1
      ) {
        this.clearTimer(gameId);
        return { auction, hasWinner: true, finished: true, game: player.game };
      }
      if (auction.usersRefused.length === player.game.players.length) {
        this.clearTimer(gameId);
        return { auction, hasWinner: false, finished: true, game: player.game };
      }
      return { auction, hasWinner: false, finished: false, game: player.game };
    } finally {
      release();
    }
  }

  async hightestInQueue(args: {
    gameId: string;
    userId: string;
    raiseBy: number;
  }) {
    const mutex = this.getMutex(args.gameId);
    const release = await mutex.acquire();
    try {
      const promisesToWin = this.promisesToWinBid.get(args.gameId);
      if (!promisesToWin?.length) {
        return { auctionUpdated: this.getAuction(args.gameId) };
      }
      const notWithCurrentUser = promisesToWin.filter(
        (promise) => promise.userId !== args.userId
      );
      if (notWithCurrentUser.length) {
        notWithCurrentUser.forEach((promise) => {
          promise.reject(args);
          this.clearTimer(`${args.gameId}:${promise.userId}`);
          this.setBuyerOnAuction(
            args.gameId,
            promise.userId,
            promise.raiseBy,
            false
          );
        });
      }
      const auctionUpdated = this.setBuyerOnAuction(
        args.gameId,
        args.userId,
        args.raiseBy,
        true
      );
      this.promisesToWinBid.delete(args.gameId);
      return { auctionUpdated };
    } finally {
      release();
    }
  }

  async winAuction(auction: Auction & { gameId: string }) {
    const fields = await this.getGameFields(auction.gameId);
    const field = this.findPlayerFieldByIndex(fields, auction.fieldIndex);
    const lastBid =
      auction.bidders[
        auction.bidders.findLastIndex((bidder) => {
          return bidder.accepted && bidder.bid;
        })
      ];
    field.ownedBy = lastBid.userId;
    const updatedPlayer =
      await this.playerService.decrementMoneyWithUserAndGameId(
        lastBid.userId,
        auction.gameId,
        lastBid.bid
      );
    await this.updateFields(fields, ['ownedBy']);
    this.setAuction(auction.gameId, null);
    return { updatedPlayer, fields };
  }

  async buyField(game: Partial<GamePayload>) {
    const player = this.playerService.findPlayerWithTurn(game);
    const fields = await this.getGameFields(game.id);
    const field = this.findPlayerFieldByIndex(fields, player.currentFieldIndex);
    if (field.ownedBy) {
      throw new WsException('Field is already owned');
    }
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
    await this.updateFields(fields, ['ownedBy']);
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
    if (!game.dices) {
      throw new WsException('You have to roll dices first');
    }
    const dices = '';
    this.setAuction(game.id, null);
    this.clearTimer(game.id);
    let { turnOfNextUserId } = this.findNextTurnUser(game);
    game.turnOfUserId = turnOfNextUserId;
    let playersNotLost = game.players.length;
    while (playersNotLost !== 1) {
      if (this.playerService.findPlayerWithTurn(game).lost) {
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

  async payForField(
    game: Partial<GamePayload>,
    playerNextField: FieldDocument
  ) {
    const currentPlayer = this.playerService.findPlayerWithTurn(game);

    if (
      currentPlayer.money <
      playerNextField.income[playerNextField.amountOfBranches]
    ) {
      const fields = await this.getGameFields(game.id);
      // We can add pledging of last owned field or smt to not make player lose immidiately
      const { updatedPlayer } = await this.playerService.loseGame(
        currentPlayer.userId,
        game.id,
        fields
      );

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

  async payToBank(game: Partial<GamePayload>, userId: string, amount: number) {
    const secretInfo = this.secrets.get(game.id);
    if (!secretInfo) this.clearTimer(game.id);
    const currentPlayer = game.players.find(
      (player) => player.userId === userId
    );
    const fields = await this.getGameFields(game.id);
    if (currentPlayer.money < amount) {
      // We can add pledging of last owned field or smt to not make player lose immidiately
      const { updatedPlayer, updatedFields } =
        await this.playerService.loseGame(
          currentPlayer.userId,
          game.id,
          fields
        );
      return { updatedGame: updatedPlayer.game, fields: updatedFields };
    }
    const playerWhoPayed =
      await this.playerService.incrementMoneyWithUserAndGameId(
        currentPlayer.userId || game.turnOfUserId,
        game.id,
        amount
      );
    if (secretInfo && secretInfo.users.includes(userId)) {
      const userIndex = secretInfo.users.findIndex(
        (userId) => userId === playerWhoPayed.userId
      );
      secretInfo.users[userIndex] = '';
    }
    if (
      secretInfo &&
      secretInfo.users.every((userId, index) => {
        if (secretInfo.users.length === 2 && userId !== '') {
          return secretInfo.amounts[index] > 0;
        }
        if (secretInfo.users.length > 2 && index === 0) {
          return true;
        }
        return userId === '';
      })
    ) {
      this.secrets.delete(game.id);
      return {
        updatedGame: playerWhoPayed.game,
        fields,
        playerWhoPayed,
      };
    }
    return {
      updatedGame: playerWhoPayed.game,
      fields,
      playerWhoPayed,
    };
  }

  decreaseHouses(gameId: string, quantity: number) {
    return this.gameRepository.updateById(gameId, {
      data: { housesQty: { decrement: quantity } },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  increaseHouses(gameId: string, quantity: number) {
    return this.gameRepository.updateById(gameId, {
      data: { housesQty: { increment: quantity } },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  decreaseHotels(gameId: string, quantity: number) {
    return this.gameRepository.updateById(gameId, {
      data: { hotelsQty: { decrement: quantity } },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  increaseHotels(gameId: string, quantity: number) {
    return this.gameRepository.updateById(gameId, {
      data: { hotelsQty: { increment: quantity } },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  hasWinner(game: Partial<GamePayload>) {
    const notLosers = this.findPlayersWhoDidntLose(game);
    return notLosers.length === 1;
  }

  async passTurnToUser(data: {
    game: Partial<GamePayload>;
    toUserId: string;
    turnTime?: number;
  }) {
    this.clearTimer(data.game.id);
    const turnEnds = this.calculateEndOfTurn(data.turnTime || 10000);
    const updatedGame = await this.updateById(data.game.id, {
      turnOfUserId: data.toUserId,
      turnEnds,
    });
    if (!data.game.dices) {
      this.eventService.emitGameEvent('setRollDiceTimer', updatedGame);
    } else {
      this.eventService.emitGameEvent('setAfterRolledDiceTimer', updatedGame);
    }

    return { updatedGame };
  }
}
