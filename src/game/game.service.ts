import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { ChatType, Prisma } from '@prisma/client';
import { AuctionService } from 'src/auction/auction.service';
import { HandlerChain } from 'src/common/handlerChain';
import { FieldService } from 'src/field/field.service';
import { FieldAnalyzer } from 'src/field/FieldAnalyzer';
import { PaymentService } from 'src/payment/payment.service';
import { PlayerService } from 'src/player/player.service';
import { FieldDocument } from 'src/schema/Field.schema';
import { SecretService } from 'src/secret/secret.service';
import { SecretAnalyzer } from 'src/secret/secretAnalyzer';
import { TimerService } from 'src/timer/timers.service';
import { DEFAULT_FIELDS } from 'src/utils/fields';
import { WebSocketProvider } from 'src/webSocketProvider/webSocketProvider.service';
import { GamePayload, GameRepository } from './game.repository';
import { PassTurnHandler } from './handlers/PassTurn.handler';
import { ProcessSpecialHandler } from './handlers/ProcessSpecial.handler';
import { PutUpForAuctionHandler } from './handlers/PutUpForAuction.handler';
import { SteppedOnPrivateHandler } from './handlers/SteppedOnPrivate.handler';
@Injectable()
export class GameService {
  constructor(
    @Inject(forwardRef(() => PlayerService))
    private playerService: PlayerService,
    private webSocketProvider: WebSocketProvider,
    private gameRepository: GameRepository,
    @Inject(forwardRef(() => AuctionService))
    private auctionService: AuctionService,
    private timerService: TimerService,
    private fieldService: FieldService,
    @Inject(forwardRef(() => SecretService))
    private secretService: SecretService,
    private paymentService: PaymentService
  ) {
    this.passTurnToUser = this.passTurnToUser.bind(this);
    this.rollDice = this.rollDice.bind(this);
    this.putUpForAuction = this.putUpForAuction.bind(this);
    this.passTurn = this.passTurn.bind(this);
    this.processPayingForField = this.processPayingForField.bind(this);
    this.transferWithBank = this.transferWithBank.bind(this);
    this.payAll = this.payAll.bind(this);
    this.payForPrivateField = this.payForPrivateField.bind(this);
    this.resolveTwoUsers = this.resolveTwoUsers.bind(this);
  }

  readonly PLAYING_FIELDS_QUANTITY = 40;

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

  async getGameData(gameId: string) {
    const game = await this.getGame(gameId);
    const auction = this.auctionService.auctions.get(game.id);
    const secretInfo = this.secretService.secrets.get(game.id);
    const fields = await this.fieldService.getGameFields(game.id);
    return { game, auction, secretInfo, fields };
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

    if (activePlayer) throw new WsException('You already have active game');
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

    await this.fieldService.createMany(gameFields);
    return newGame;
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

  async joinGame(gameId: string, userId: string) {
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
      throw new WsException('You cannot join this game');
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
      const turnEnds = this.timerService.calculateFutureTime(game.timeOfTurn);
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
      return startedGame;
    }
    return gameWithCreatedPlayer;
  }

  startGame(game: Partial<GamePayload>) {
    // We can setTimeout here for some countdown on frontend
    this.webSocketProvider.server.emit('clearStartedGame', {
      gameId: game.id,
    });
    this.webSocketProvider.server.to(game.id).emit('startGame', {
      game,
      chatId: game.chat.id,
    });
    this.timerService.set(game.id, game.timeOfTurn, game, this.rollDice);
  }

  async leaveGame(gameId: string, userId: string) {
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

  getRandomDicesString() {
    const firstDice = Math.ceil(Math.random() * 6);
    const secondDice = Math.ceil(Math.random() * 6);
    return `${firstDice}:${secondDice}`;
  }

  async rollDice(game: Partial<GamePayload>) {
    if (game.dices) throw new WsException('You have already rolled dices');
    this.timerService.clear(game.id);
    const { playerNextField, fields, updatedGame } = await this.makeTurn(game);
    await this.processRolledDices(updatedGame, playerNextField, fields);
  }

  private async handlePaymentField(
    game: Partial<GamePayload>,
    field: FieldDocument
  ) {
    this.timerService.set(
      game.id,
      game.timeOfTurn,
      { game, userId: game.turnOfUserId, amount: field.toPay },
      this.transferWithBank
    );
  }

  private async handleSecretField(game: Partial<GamePayload>) {
    const { message, secretInfo } =
      await this.secretService.handleSecretWithMessage(game);

    this.webSocketProvider.server.to(game.id).emit('gameChatMessage', message);
    this.webSocketProvider.server.to(game.id).emit('secret', secretInfo);

    await this.processSecretByUserCount(game, secretInfo.users.length);
  }

  async processSpecialField(
    game: Partial<GamePayload>,
    playerNextField: FieldDocument
  ) {
    if (playerNextField.toPay) {
      await this.handlePaymentField(game, playerNextField);
    }

    if (playerNextField.secret) {
      await this.handleSecretField(game);
    }
  }

  async processRolledDices(
    game: Partial<GamePayload>,
    playerNextField?: FieldDocument,
    fields?: FieldDocument[]
  ) {
    if (!playerNextField) {
      playerNextField = await this.findCurrentFieldFromGame(game);
    }
    const fieldAnalyzer = new FieldAnalyzer(
      playerNextField,
      game,
      this.playerService
    );
    this.webSocketProvider.server.to(game.id).emit('rolledDice', {
      ...(fields !== undefined && { fields }),
      game,
    });
    const chain = new HandlerChain();
    chain.addHandlers(
      new PassTurnHandler(fieldAnalyzer, () => {
        this.timerService.set(game.id, 2500, game, this.passTurn);
      }),
      new ProcessSpecialHandler(fieldAnalyzer, () => {
        this.processSpecialField(game, playerNextField);
      }),
      new SteppedOnPrivateHandler(fieldAnalyzer, () => {
        this.steppedOnPrivateField(fieldAnalyzer);
      }),
      new PutUpForAuctionHandler(fieldAnalyzer, () => {
        this.timerService.set(
          game.id,
          game.timeOfTurn,
          game,
          this.putUpForAuction
        );
      })
    );
    chain.process();
  }

  private async processSecretByUserCount(
    game: Partial<GamePayload>,
    userCount: number
  ) {
    if (userCount === 1) {
      return this.oneUserTransfer(game);
    }

    if (userCount === 2) {
      return this.twoUsersTransfer(game);
    }

    if (userCount > 2) {
      return this.multipleUsersTransfer(game);
    }
  }

  async oneUserTransfer(game: Partial<GamePayload>) {
    const secretInfo = this.secretService.secrets.get(game.id);
    const secretAnalyzer = new SecretAnalyzer(secretInfo, game.turnOfUserId);
    if (secretAnalyzer.isOneUserHaveToPay()) {
      this.timerService.set(
        game.id,
        game.timeOfTurn,
        { game, userId: game.turnOfUserId, amount: secretInfo.amounts[0] },
        this.transferWithBank
      );
    } else {
      this.timerService.set(
        game.id,
        2000,
        { game, userId: game.turnOfUserId, amount: secretInfo.amounts[0] },
        this.transferWithBank
      );
    }
  }

  private async twoUsersTransfer(game: Partial<GamePayload>) {
    this.timerService.set(game.id, game.timeOfTurn, game, this.resolveTwoUsers);
  }

  private async multipleUsersTransfer(game: Partial<GamePayload>) {
    this.timerService.set(game.id, game.timeOfTurn, game, this.payAll);
  }

  async payAll(game: Partial<GamePayload>) {
    const updatedGame = await this.secretService.payAllforSecret(game);
    this.webSocketProvider.server.to(game.id).emit('updatePlayers', {
      game: updatedGame,
    });
    this.passTurn(updatedGame);
  }

  async resolveTwoUsers(game: Partial<GamePayload>) {
    const { userId, loseGame, fields, updatedGame } =
      await this.secretService.resolveTwoUsers(game);
    let gameAfterLoss = null;
    if (loseGame) {
      gameAfterLoss = await this.loseGame(userId, game.id, fields);
    }
    this.passTurn(gameAfterLoss || updatedGame);
  }

  async transferWithBank(argsObj: {
    game: Partial<GamePayload>;
    amount: number;
    userId: string;
  }) {
    const { updatedGame } = await this.paymentService.transferWithBank(
      argsObj.game,
      argsObj.userId,
      argsObj.amount
    );
    const secretInfo = this.secretService.secrets.get(updatedGame.id);
    if (!secretInfo) {
      await this.passTurn(updatedGame);
    } else {
      this.webSocketProvider.server.to(updatedGame.id).emit('updatePlayers', {
        game: updatedGame,
        secretInfo,
      });
    }
  }

  async payToBankForSpecialField(userId: string, game: Partial<GamePayload>) {
    const currentField = await this.findCurrentFieldWithUserId(game);
    if (!game.dices && !currentField.toPay)
      throw new WsException(
        'You cant pay for that field because its not special field'
      );
    return this.transferWithBank({
      game: game,
      userId,
      amount: currentField.toPay,
    });
  }

  async steppedOnPrivateField({ currentPlayer, field, game }: FieldAnalyzer) {
    const fields = await this.fieldService.getGameFields(game.id);
    if (
      this.playerService.estimateAssets(currentPlayer, fields) >=
      field.income[field.amountOfBranches]
    ) {
      this.timerService.set(
        game.id,
        game.timeOfTurn,
        game,
        this.payForPrivateField
      );
      return;
    }
    const { updatedPlayer } = await this.loseGame(
      currentPlayer.userId,
      game.id,
      fields
    );
    await this.passTurn(updatedPlayer.game);
  }

  async putUpForAuction(game: Partial<GamePayload>) {
    const auction = await this.auctionService.putUpForAuction(game);
    const updatedGame = await this.updateGameWithNewTurn(game, 15000);
    this.webSocketProvider.server
      .to(game.id)
      .emit('hasPutUpForAuction', { game: updatedGame, auction });
    this.timerService.set(game.id, 15000, updatedGame, this.passTurn);
  }

  async findCurrentFieldFromGame(game: Partial<GamePayload>) {
    const player = await this.playerService.findByUserAndGameId(
      game.turnOfUserId,
      game.id
    );
    const fields = await this.fieldService.getGameFields(game.id);
    return this.fieldService.findPlayerFieldByIndex(
      fields,
      player.currentFieldIndex
    );
  }

  async updateGameWithNewTurn(
    game: Partial<GamePayload>,
    timeOfTurn: number | null = null
  ) {
    const turnEnds = this.timerService.calculateFutureTime(
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

  async decrementPledgedFields(fields: FieldDocument[]) {
    fields.forEach((field) => {
      if (field.isPledged && field.turnsToUnpledge === 0) {
        field.isPledged = false;
        field.ownedBy = '';
      } else if (field.isPledged) {
        field.turnsToUnpledge--;
      }
    });
    await this.fieldService.updateFields(fields, [
      'isPledged',
      'ownedBy',
      'turnsToUnpledge',
    ]);
  }

  async makeTurn(game: Partial<GamePayload>) {
    const dices = this.getRandomDicesString();

    const currentPlayer = this.playerService.findPlayerWithTurn(game);
    const dicesArr = this.parseDicesToArr(dices);
    const fields = await this.fieldService.getGameFields(game.id);
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

    const playerNextField = this.fieldService.findPlayerFieldByIndex(
      fields,
      nextIndex
    );
    let updatedGame: null | Partial<GamePayload> = null;
    if (playerNextField.ownedBy !== currentPlayer.userId) {
      const turnEnds = this.timerService.calculateFutureTime(game.timeOfTurn);
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
      playerNextField,
    };
  }

  async findCurrentFieldWithUserId(game: Partial<GamePayload>) {
    const player = this.playerService.findPlayerWithTurn(game);
    const fields = await this.fieldService.getGameFields(game.id);
    return this.fieldService.findPlayerFieldByIndex(
      fields,
      player.currentFieldIndex
    );
  }

  async buyField(game: Partial<GamePayload>) {
    await this.processBuyField(game);
    this.passTurn(game);
  }

  async processBuyField(game: Partial<GamePayload>) {
    const player = this.playerService.findPlayerWithTurn(game);
    const fields = await this.fieldService.getGameFields(game.id);
    const field = this.fieldService.findPlayerFieldByIndex(
      fields,
      player.currentFieldIndex
    );
    if (field.ownedBy) {
      throw new WsException('Field is already owned');
    }
    if (
      !field.price ||
      field.price > player.money ||
      field.ownedBy === player.userId ||
      this.auctionService.getAuction(game.id)
    ) {
      throw new WsException('You cant buy this field');
    }
    this.timerService.clear(game.id);
    field.ownedBy = game.turnOfUserId;
    await this.fieldService.updateFields(fields, ['ownedBy']);
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

  async passTurn(game: Partial<GamePayload>, fromEvent: boolean = false) {
    const fields = await this.fieldService.getGameFields(game.id);
    const currentPlayer = this.playerService.findPlayerWithTurn(game);
    const currentField = this.fieldService.findPlayerFieldByIndex(
      fields,
      currentPlayer.currentFieldIndex
    );
    if (
      fromEvent &&
      !currentField.large &&
      currentField.ownedBy !== game.turnOfUserId
    ) {
      throw new WsException('You cant pass turn with that field');
    }

    if (!game.dices) {
      throw new WsException('You have to roll dices first');
    }
    const dices = '';
    this.auctionService.setAuction(game.id, null);
    this.timerService.clear(game.id);
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
    const turnEnds = this.timerService.calculateFutureTime(game.timeOfTurn);
    const updatedGame = await this.updateById(game.id, {
      turnOfUserId: turnOfNextUserId,
      dices,
      turnEnds,
    });
    this.webSocketProvider.server
      .to(game.id)
      .emit('passTurnToNext', { game: updatedGame, fields });
    this.timerService.set(game.id, game.timeOfTurn, updatedGame, this.rollDice);
  }

  async payForPrivateField(game: Partial<GamePayload>) {
    const currentField = await this.findCurrentFieldWithUserId(game);
    if (!game.dices || !currentField.ownedBy)
      throw new WsException('You cant pay for that field');
    this.timerService.clear(game.id);
    const { updatedGame, fields: updatedFields } =
      await this.processPayingForField(game, currentField);
    this.webSocketProvider.server.to(game.id).emit('payedForField', {
      game: updatedGame,
      fields: updatedFields,
    });
    this.passTurn(updatedGame);
  }

  async processPayingForField(
    game: Partial<GamePayload>,
    playerNextField: FieldDocument
  ) {
    const currentPlayer = this.playerService.findPlayerWithTurn(game);

    if (
      currentPlayer.money <
      playerNextField.income[playerNextField.amountOfBranches]
    ) {
      const fields = await this.fieldService.getGameFields(game.id);
      // We can add pledging of last owned field or smt to not make player lose immidiately
      const { updatedPlayer } = await this.loseGame(
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
    this.timerService.clear(data.game.id);
    const turnEnds = this.timerService.calculateFutureTime(
      data.turnTime || 10000
    );
    const updatedGame = await this.updateById(data.game.id, {
      turnOfUserId: data.toUserId,
      turnEnds,
    });
    if (!updatedGame.dices) {
      this.timerService.set(
        updatedGame.id,
        updatedGame.timeOfTurn,
        updatedGame,
        this.rollDice
      );
    } else {
      this.processRolledDices(updatedGame);
    }
    return { updatedGame };
  }

  async buyBranch(game: Partial<GamePayload>, index: number, userId: string) {
    const fieldToBuyBranch =
      await this.playerService.checkWhetherPlayerHasAllGroup(
        game,
        index,
        userId
      );
    this.playerService.checkFieldHasMaxBranches(fieldToBuyBranch);
    const playerToPay = game.players.find((player) => player.userId === userId);
    if (playerToPay.money < fieldToBuyBranch.branchPrice) {
      throw new WsException('You dont have enough money to buy branch');
    }
    const player = await this.playerService.decrementMoneyWithUserAndGameId(
      userId,
      game.id,
      fieldToBuyBranch.branchPrice
    );
    fieldToBuyBranch.amountOfBranches++;
    let updatedGame = null;
    if (fieldToBuyBranch.amountOfBranches === 5) {
      await this.decreaseHotels(player.game.id, 1);
      updatedGame = await this.increaseHouses(player.game.id, 4);
    } else {
      updatedGame = await this.decreaseHouses(player.game.id, 1);
    }
    await this.fieldService.updateById(fieldToBuyBranch._id, {
      amountOfBranches: fieldToBuyBranch.amountOfBranches,
    });
    const fields = await this.fieldService.getGameFields(game.id);
    return { updatedGame, fields };
  }

  async sellBranch(game: Partial<GamePayload>, index: number, userId: string) {
    const fieldToSellBranch =
      await this.playerService.checkWhetherPlayerHasAllGroup(
        game,
        index,
        userId,
        false
      );
    this.playerService.checkFieldHasBranches(fieldToSellBranch);
    const player = await this.playerService.incrementMoneyWithUserAndGameId(
      userId,
      game.id,
      fieldToSellBranch.sellBranchPrice
    );
    fieldToSellBranch.amountOfBranches--;
    let updatedGame = null;
    if (fieldToSellBranch.amountOfBranches === 4) {
      await this.increaseHotels(player.game.id, 1);
      updatedGame = await this.decreaseHouses(player.game.id, 4);
    } else {
      updatedGame = await this.increaseHouses(player.game.id, 1);
    }
    await this.fieldService.updateById(fieldToSellBranch._id, {
      amountOfBranches: fieldToSellBranch.amountOfBranches,
    });
    const fields = await this.fieldService.getGameFields(game.id);
    return { updatedGame, fields };
  }

  async loseGame(userId: string, gameId: string, fields?: FieldDocument[]) {
    if (!fields) {
      fields = await this.fieldService.getGameFields(gameId);
    }
    this.timerService.clear(gameId);
    const updatedPlayer = await this.playerService.updateLostGame(
      userId,
      gameId
    );
    const updatedGame = await this.updateById(gameId, {
      dices: 'playerLost',
    });
    fields.forEach((field) => {
      if (field.ownedBy === updatedPlayer.userId) {
        field.ownedBy = null;
        field.amountOfBranches = 0;
        field.isPledged = false;
        field.turnsToUnpledge = null;
      }
    });
    await this.fieldService.updateFields(fields, [
      'ownedBy',
      'amountOfBranches',
      'isPledged',
      'turnsToUnpledge',
    ]);
    if (this.hasWinner(updatedPlayer.game)) {
      this.timerService.clear(updatedPlayer.game.id);
      const game = await this.updateById(updatedPlayer.game.id, {
        status: 'FINISHED',
      });
      this.webSocketProvider.server.to(game.id).emit('playerWon', { game });
      return { updatedPlayer, fields };
    }
    this.passTurn(updatedGame);
    return { updatedPlayer, updatedFields: fields };
  }

  mortgageField(game: Partial<GamePayload>, index: number, userId?: string) {
    const auction = this.auctionService.auctions.get(game.id);
    const secretInfo = this.secretService.secrets.get(game.id);
    if (auction || secretInfo)
      throw new WsException(
        'You cant pledge field while auction or secret is active'
      );
    return this.playerService.pledgeField(game, index, userId);
  }

  async payToUserForSecret(game: Partial<GamePayload>, userId: string) {
    const {
      game: updatedGame,
      secretInfo,
      loseGame,
    } = await this.secretService.payToUserForSecret(game, userId);
    let gameAfterLoss = null;
    if (loseGame) {
      gameAfterLoss = await this.loseGame(userId, game.id);
    }
    return { game: loseGame ? gameAfterLoss : updatedGame, secretInfo };
  }

  async payToBankForSecret(game: Partial<GamePayload>, userId: string) {
    const amountToPay = await this.secretService.payToBankForSecret(
      game,
      userId
    );
    await this.transferWithBank({
      game: game,
      userId,
      amount: amountToPay,
    });
  }
}
