import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { parse } from 'cookie';
import { Server, Socket } from 'socket.io';
import { AuctionService } from 'src/auction/auction.service';
import { HasLostGuard } from 'src/auth/guard';
import { ActiveGameGuard } from 'src/auth/guard/activeGame.guard';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { TurnGuard } from 'src/auth/guard/turn.guard';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { FieldAnalyzer } from 'src/field/FieldAnalyzer';
import { PaymentService } from 'src/payment/payment.service';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { PlayerService } from 'src/player/player.service';
import { FieldDocument } from 'src/schema/Field.schema';
import { SecretService } from 'src/secret/secret.service';
import { SecretAnalyzer } from 'src/secret/secretAnalyzer';
import { TimerService } from 'src/timer/timers.service';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { WebSocketServerService } from 'src/webSocketServer/webSocketServer.service';
import { GetGameId } from './decorators/getGameCookieWs';
import { GamePayload } from './game.repository';
import { GameService } from './game.service';
import { HandlerChain } from '../common/handlerChain';
import { PassTurnHandler } from './handlers/passTurn.handler';
import { ProcessSpecialHandler } from './handlers/processSpecial.handler';
import { PutUpForAuctionHandler } from './handlers/putUpForAuction.handler';
import { SteppedOnPrivateHandler } from './handlers/steppedOnPrivate.handler';
import { Auction } from './types/auction.type';
import { Trade } from './types/trade.type';
import { FieldService } from 'src/field/field.service';

@WebSocketGateway({
  cors: {
    origin:
      process.env.NODE_ENV === 'development'
        ? process.env.FRONTEND_URL_DEV
        : process.env.FRONTEND_URL_PROD,
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
@UseFilters(WebsocketExceptionsFilter)
@UsePipes(new WsValidationPipe())
@UseGuards(WsGuard)
export class GameGateway {
  constructor(
    private gameService: GameService,
    private playerService: PlayerService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private webSocketServer: WebSocketServerService,
    private auctionService: AuctionService,
    private timerService: TimerService,
    private secretService: SecretService,
    private paymentService: PaymentService,
    private fieldService: FieldService
  ) {
    this.rollDice = this.rollDice.bind(this);
    this.putUpForAuction = this.putUpForAuction.bind(this);
    this.passTurnToNext = this.passTurnToNext.bind(this);
    this.winAuction = this.winAuction.bind(this);
    this.payForField = this.payForField.bind(this);
    this.transferWithBank = this.transferWithBank.bind(this);
    this.payAll = this.payAll.bind(this);
    this.resolveTwoUsers = this.resolveTwoUsers.bind(this);
  }

  @WebSocketServer()
  private server: Server;

  afterInit(server: Server) {
    this.webSocketServer.setServer(server);
  }

  async handleConnection(socket: Socket & { jwtPayload: JwtPayload }) {
    try {
      const cookies = await this.extractCookies(socket);
      if (!cookies) return;
      const { gameId, userId } = cookies;
      if (!gameId) return;
      if (!userId) return;
      socket.join(userId);
      const game = await this.gameService.getGame(gameId);
      if (!game || game.status !== 'ACTIVE') return;
      const timers = this.timerService.timers;
      if (timers.has(gameId)) {
        this.rejoinGame(socket, gameId);
        return;
      }
      const updatedGame = await this.gameService.updateGameWithNewTurn(game);
      this.rejoinGame(socket, gameId);
      const currentField =
        await this.gameService.findCurrentFieldFromGame(game);
      let timerCallback: (args: unknown) => Promise<void>;
      if (game.dices) {
        timerCallback = currentField?.price
          ? this.putUpForAuction
          : this.passTurnToNext;
      } else {
        timerCallback = this.rollDice;
      }

      this.timerService.set(
        gameId,
        updatedGame.timeOfTurn,
        updatedGame,
        timerCallback
      );
    } catch (err) {
      console.log(err);
    }
  }

  private async extractCookies(socket: Socket & { jwtPayload: JwtPayload }) {
    const cookies = socket.handshake.headers.cookie
      ? parse(socket.handshake.headers.cookie)
      : null;

    if (!cookies?.gameId) return null;

    const { gameId, access_token } = cookies;
    const decoded = await this.jwtService.verify(access_token, {
      publicKey: this.configService.get('ACCESS_TOKEN_PUB_KEY'),
    });
    return { gameId, userId: decoded.sub };
  }

  private rejoinGame(socket: Socket, gameId: string) {
    socket.join(gameId);
    socket.emit('rejoin');
  }

  private leaveAllRoomsExceptInitial(socket: Socket) {
    const rooms = socket.rooms;
    let i = 0;
    rooms.forEach((room) => {
      if (i !== 0) {
        socket.leave(room);
      }
      i++;
    });
  }

  @SubscribeMessage('getVisibleGames')
  async getVisibleGames() {
    const games = await this.gameService.getVisibleGames();
    return games;
  }

  @SubscribeMessage('getGameData')
  async getGameData(@GetGameId() gameId: string) {
    const game = await this.gameService.getGame(gameId);
    const auction = this.auctionService.auctions.get(game.id);
    const secretInfo = this.secretService.secrets.get(game.id);
    const fields = await this.fieldService.getGameFields(game.id);
    this.server.emit('gameData', { game, fields, auction, secretInfo });
  }

  @SubscribeMessage('joinGame')
  async onJoinGame(
    socket: Socket & { jwtPayload: JwtPayload },
    data: { id: string }
  ) {
    const { game, shouldStart } = await this.gameService.onJoinGame(
      data.id,
      socket.jwtPayload.sub
    );
    if (!game) {
      this.server
        .to(socket.id)
        .emit('error', { message: 'Could not join game' });
      return;
    }
    this.leaveAllRoomsExceptInitial(socket);
    socket.join(data.id);
    this.server.emit('onParticipateGame', game);
    if (shouldStart) {
      this.startGame(game);
    }
  }

  private startGame(game: Partial<GamePayload>) {
    // We can setTimeout here for some countdown on frontend
    this.server.emit('clearStartedGame', {
      gameId: game.id,
    });
    this.server.to(game.id).emit('startGame', {
      game,
      chatId: game.chat.id,
    });
    this.timerService.set(game.id, game.timeOfTurn, game, this.rollDice);
  }

  @SubscribeMessage('leaveGame')
  async onLeaveGame(
    socket: Socket & { jwtPayload: JwtPayload },
    data: { id: string }
  ) {
    const game = await this.gameService.onLeaveGame(
      data.id,
      socket.jwtPayload.sub
    );
    if (game) {
      this.leaveAllRoomsExceptInitial(socket);
      this.server.emit('onParticipateGame', {
        id: data.id,
        players: game.players,
      });
    }
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('rollDice')
  async onRollDice(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    if (socket.game.dices)
      throw new WsException('You have already rolled dices');
    this.timerService.clear(socket.game.id);
    await this.rollDice(socket.game);
  }

  async rollDice(game: Partial<GamePayload>) {
    const { fieldAnalyzer, fields } = await this.gameService.makeTurn(game);
    this.server.to(game.id).emit('rolledDice', {
      fields,
      game: fieldAnalyzer.game,
    });
    const chain = new HandlerChain();
    chain.addHandlers(
      new PassTurnHandler(fieldAnalyzer, () => {
        this.timerService.set(
          game.id,
          2500,
          fieldAnalyzer.game,
          this.passTurnToNext
        );
      }),
      new ProcessSpecialHandler(fieldAnalyzer, () => {
        this.processSpecialField(fieldAnalyzer.game, fieldAnalyzer.field);
      }),
      new SteppedOnPrivateHandler(fieldAnalyzer, () => {
        this.steppedOnPrivateField(fieldAnalyzer);
      }),
      new PutUpForAuctionHandler(fieldAnalyzer, () => {
        this.timerService.set(
          game.id,
          game.timeOfTurn,
          fieldAnalyzer.game,
          this.putUpForAuction
        );
      })
    );
    chain.process();
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

    this.server.to(game.id).emit('gameChatMessage', message);
    this.server.to(game.id).emit('secret', secretInfo);

    await this.processSecretByUserCount(game, secretInfo.users.length);
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
    const secretAnalyzer = new SecretAnalyzer(secretInfo);
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
    const updatedGame = await this.paymentService.payAllforSecret(game);
    this.server.to(game.id).emit('updatePlayers', {
      game: updatedGame,
    });
    this.passTurnToNext(updatedGame);
  }

  async resolveTwoUsers(game: Partial<GamePayload>) {
    const updatedGame = await this.secretService.resolveTwoUsers(game);
    this.passTurnToNext(updatedGame);
  }

  @UseGuards(ActiveGameGuard, HasLostGuard)
  @SubscribeMessage('payToUserForSecret')
  async payToUserForSecret(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    const game = socket.game;
    const userId = socket.jwtPayload.sub;
    const { game: updatedGame, secretInfo } =
      await this.paymentService.payToUserForSecret({
        game,
        userId,
      });
    this.server.to(game.id).emit('updatePlayers', {
      game: updatedGame,
      secretInfo,
    });
  }

  @UseGuards(ActiveGameGuard, HasLostGuard)
  @SubscribeMessage('transferWithBank')
  async ontransferWithBank(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    const currentField = await this.gameService.findCurrentFieldWithUserId(
      socket.game
    );
    const secretInfo = this.secretService.secrets.get(socket.game.id);
    if (!socket.game.dices && !currentField.toPay && !secretInfo)
      throw new WsException(
        'You cant pay for that field because smt is missing'
      );
    if (currentField.toPay) {
      return this.transferWithBank({
        game: socket.game,
        userId: socket.jwtPayload.sub,
        amount: currentField.toPay,
      });
    }
    let amountToPay = 0;
    if (!secretInfo.users.includes(socket.jwtPayload.sub)) {
      throw new WsException(
        'You cant pay to bank because no user in secretInfo'
      );
    }
    if (secretInfo.numOfPlayersInvolved === 'one') {
      if (secretInfo.amounts[0] > 0) {
        throw new WsException(
          'You cant pay to bank because one user and he doesnt have to pay'
        );
      } else {
        amountToPay = secretInfo.amounts[0];
      }
    } else if (secretInfo.numOfPlayersInvolved === 'two') {
      const index = secretInfo.users.findIndex(
        (userId) => userId === socket.jwtPayload.sub
      );
      if (secretInfo.amounts[index] > 0) {
        throw new WsException(
          'You cant pay to bank two users and the one wants to pay dont have to'
        );
      } else {
        amountToPay = secretInfo.amounts[0];
      }
    } else if (secretInfo.numOfPlayersInvolved === 'all') {
      if (
        secretInfo.users.every((userId, index) => {
          if (index === 0) return true;
          return userId === '';
        }) &&
        secretInfo.amounts[0] === null
      ) {
        throw new WsException('You get money from all u dont have to pay');
      }
      if (secretInfo.amounts.length === 2) {
        amountToPay = secretInfo.amounts[1];
      }
      if (secretInfo.amounts.length === 1) {
        amountToPay = secretInfo.amounts[0];
      }
    }

    await this.transferWithBank({
      game: socket.game,
      userId: socket.jwtPayload.sub,
      amount: amountToPay,
    });
    const indexOfUser = secretInfo.users.findIndex(
      (userId) => userId === socket.jwtPayload.sub
    );
    secretInfo.users[indexOfUser] = '';
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
      await this.passTurnToNext(updatedGame);
    } else {
      this.server.to(updatedGame.id).emit('updatePlayers', {
        game: updatedGame,
        secretInfo,
      });
    }
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
        { game, field: field },
        this.payForField
      );
      return;
    }
    const { updatedPlayer } = await this.playerService.loseGame(
      currentPlayer.userId,
      game.id,
      fields
    );

    await this.passTurnToNext(updatedPlayer.game);
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('payForField')
  async onPayForField(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    const currentField = await this.gameService.findCurrentFieldWithUserId(
      socket.game
    );
    if (!socket.game.dices || !currentField.ownedBy)
      throw new WsException('You cant pay for that field');
    this.timerService.clear(socket.game.id);
    await this.payForField({ game: socket.game, field: currentField });
  }

  async payForField({
    game,
    field,
  }: {
    game: Partial<GamePayload>;
    field: FieldDocument;
  }) {
    const { updatedGame, fields: updatedFields } =
      await this.gameService.payForField(game, field);
    this.server.to(game.id).emit('payedForField', {
      game: updatedGame,
      fields: updatedFields,
    });
    this.passTurnToNext(updatedGame);
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('putUpForAuction')
  async onPutUpForAuction(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.putUpForAuction(socket.game);
  }

  async putUpForAuction(game: Partial<GamePayload>) {
    const auction = await this.auctionService.putUpForAuction(game);

    const updatedGame = await this.gameService.updateGameWithNewTurn(
      game,
      15000
    );
    this.server
      .to(game.id)
      .emit('hasPutUpForAuction', { game: updatedGame, auction });
    this.timerService.set(game.id, 15000, updatedGame, this.passTurnToNext);
  }

  @SubscribeMessage('createGame')
  async createGame(socket: Socket & { jwtPayload: JwtPayload }) {
    const createdGameWithPlayer = await this.gameService.createGame(
      socket.jwtPayload.sub
    );

    if (!createdGameWithPlayer) {
      return socket.emit('error', {
        message:
          'Ви вже знаходитесь в кімнаті, покиньте її щоб приєднатись до іншої',
      });
    } else {
      socket.join(createdGameWithPlayer.id);
    }

    return this.server.emit('newGameCreated', createdGameWithPlayer);
  }

  @UseGuards(ActiveGameGuard, HasLostGuard)
  @SubscribeMessage('raisePrice')
  async raisePrice(
    @ConnectedSocket() socket: Socket & { jwtPayload: JwtPayload },
    @GetGameId() gameId: string,
    @MessageBody('raiseBy') raiseBy: number,
    @MessageBody('bidAmount') bidAmount: number
  ) {
    const userId = socket.jwtPayload.sub;
    const auction = await this.auctionService.raisePrice(
      gameId,
      userId,
      raiseBy,
      bidAmount
    );

    if (auction) {
      this.server.to(gameId).emit('raisedPrice', { auction });
      this.timerService.set(
        gameId,
        15000,
        { ...auction, gameId },
        this.winAuction
      );
    } else {
      this.server.to(userId).emit('error', {
        message: 'Хтось одночасно поставив з вами і перебив вашу ставку',
      });
    }
  }

  @UseGuards(ActiveGameGuard, HasLostGuard)
  @SubscribeMessage('refuseAuction')
  async refuseAuction(
    @ConnectedSocket() socket: Socket & { jwtPayload: JwtPayload },
    @GetGameId() gameId: string
  ) {
    const userId = socket.jwtPayload.sub;
    const { auction, hasWinner, finished, game } =
      await this.auctionService.refuseAuction(gameId, userId);
    if (finished) {
      if (hasWinner) {
        this.winAuction({ ...auction, gameId });
      } else {
        this.passTurnToNext(game);
      }
    } else {
      this.server.to(gameId).emit('refusedFromAuction', { auction });
    }
  }

  async winAuction(auction: Auction & { gameId: string }) {
    const { updatedPlayer, fields } =
      await this.auctionService.winAuction(auction);
    this.server
      .to(auction.gameId)
      .emit('wonAuction', { auction, game: updatedPlayer.game, fields });
    this.passTurnToNext(updatedPlayer.game);
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('buyField')
  async onBuyField(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.buyField(socket.game);
  }

  async buyField(game: Partial<GamePayload>) {
    await this.gameService.buyField(game);
    this.passTurnToNext(game);
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('passTurn')
  async onPassTurn(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    const fields = await this.fieldService.getGameFields(socket.game.id);
    const currentPlayer = this.playerService.findPlayerWithTurn(socket.game);
    const currentField = this.fieldService.findPlayerFieldByIndex(
      fields,
      currentPlayer.currentFieldIndex
    );
    if (!currentField.large && currentField.ownedBy !== socket.jwtPayload.sub) {
      throw new WsException('You cant pass turn with that field');
    }
    await this.passTurnToNext(socket.game);
  }

  async passTurnToNext(game: Partial<GamePayload>) {
    const { updatedGame } = await this.gameService.passTurnToNext(game);
    const fields = await this.fieldService.getGameFields(game.id);
    this.server
      .to(game.id)
      .emit('passTurnToNext', { game: updatedGame, fields });
    this.timerService.set(game.id, game.timeOfTurn, updatedGame, this.rollDice);
  }
  @OnEvent('passTurnToNext')
  async handlePassTurnToNext(data: { game: Partial<GamePayload> }) {
    this.passTurnToNext(data.game);
  }
  @OnEvent('offerTrade')
  async handleOfferTrade(data: { game: Partial<GamePayload>; trade: Trade }) {
    const { updatedGame } = await this.gameService.passTurnToUser({
      game: data.game,
      toUserId: data.trade.toUserId,
    });
    this.server.to(data.game.id).emit('updateGameData', { game: updatedGame });
    this.server
      .to(data.trade.toUserId)
      .emit('tradeOffered', { trade: data.trade });
    this.timerService.set(
      updatedGame.id,
      10000,
      updatedGame,
      this.playerService.refuseFromTrade
    );
  }
  @OnEvent('setRollDiceTimer')
  async handleSetRollDiceTimer(game: Partial<GamePayload>) {
    this.timerService.set(game.id, game.timeOfTurn, game, this.rollDice);
  }
  @OnEvent('setAfterRolledDiceTimer')
  async handleSetAfterRolledDiceTimer(updatedGame: Partial<GamePayload>) {
    const currentPlayer = this.playerService.findPlayerWithTurn(updatedGame);
    const fields = await this.fieldService.getGameFields(updatedGame.id);
    const playerNextField = this.fieldService.findPlayerFieldByIndex(
      fields,
      currentPlayer.currentFieldIndex
    );
    const fieldAnalyzer = new FieldAnalyzer(
      playerNextField,
      updatedGame,
      this.playerService
    );
    if (
      playerNextField.price &&
      playerNextField.ownedBy === updatedGame?.turnOfUserId
    ) {
      this.timerService.set(
        updatedGame.id,
        2500,
        updatedGame,
        this.passTurnToNext
      );
    }
    if (
      playerNextField.ownedBy &&
      playerNextField.ownedBy !== currentPlayer.userId
    ) {
      this.steppedOnPrivateField(fieldAnalyzer);
      return;
    }
    if (playerNextField.price && !playerNextField.ownedBy) {
      this.timerService.set(
        updatedGame.id,
        updatedGame.timeOfTurn,
        updatedGame,
        this.putUpForAuction
      );
    }
    if (!playerNextField.price) {
      this.processSpecialField(updatedGame, playerNextField);
    }
    const currentField =
      await this.gameService.findCurrentFieldWithUserId(updatedGame);
    if (
      currentField?.specialField &&
      !currentField.secret &&
      !currentField.toPay
    ) {
      this.timerService.set(
        updatedGame.id,
        12000,
        updatedGame,
        this.passTurnToNext
      );
    }
  }
}
