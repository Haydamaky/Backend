import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { parse } from 'cookie';
import { Server, Socket } from 'socket.io';
import { AuctionService } from 'src/auction/auction.service';
import { TurnGuard, ValidPlayerGuard, WsGuard } from 'src/auth/guard';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { TimerService } from 'src/timer/timers.service';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { WebSocketProvider } from 'src/webSocketProvider/webSocketProvider.service';
import { GetGameId } from './decorators/getGameCookieWs';
import { GamePayload } from './game.repository';
import { GameService } from './game.service';

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
export class GameGateway {
  constructor(
    private gameService: GameService,
    private webSocketProvider: WebSocketProvider,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auctionService: AuctionService,
    private timerService: TimerService
  ) {}
  @WebSocketServer()
  readonly server: Server;
  afterInit(server: Server) {
    this.webSocketProvider.setServer(server);
  }
  async handleConnection(
    socket: Socket & { jwtPayload: JwtPayload; gameId: string }
  ) {
    try {
      await this.extractCookies(socket);
      const userId = socket.data.jwtPayload?.sub;
      const gameId = socket.gameId;
      if (!userId) return;
      if (!gameId) return;
      socket.join(userId);
      const game = await this.gameService.getGame(gameId);
      if (game.status !== 'ACTIVE') return;
      const timers = this.timerService.timers;
      if (timers.has(gameId)) {
        this.rejoinGame(socket, gameId);
        return;
      }
      const updatedGame = await this.gameService.updateGameWithNewTurn(game);
      this.rejoinGame(socket, gameId);
      const currentField =
        await this.gameService.findCurrentFieldFromGame(game);
      if (game.dices) {
        this.gameService.processRolledDices(game, currentField);
      } else {
        this.timerService.set(
          gameId,
          updatedGame.timeOfTurn,
          updatedGame,
          this.gameService.rollDice
        );
      }
    } catch (err) {
      console.log(err);
    }
  }

  private async extractCookies(socket: Socket) {
    const cookies = socket.handshake.headers.cookie
      ? parse(socket.handshake.headers.cookie)
      : null;

    if (!cookies?.gameId) return null;

    const { gameId, accessToken } = cookies;
    const decoded = await this.jwtService.verify(accessToken, {
      publicKey: this.configService.get('ACCESS_TOKEN_PUB_KEY'),
    });
    socket['jwtPayload'] = decoded;
    socket['gameId'] = gameId;
    socket.data.jwtPayload = decoded;
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
  async onGetVisibleGames() {
    const games = await this.gameService.getVisibleGames();
    return games;
  }

  @SubscribeMessage('getAllGameData')
  async onGetAllGameData(@GetGameId() gameId: string) {
    const { game, fields, auction, secretInfo } =
      await this.gameService.getAllGameData(gameId);
    this.server
      .to(gameId)
      .emit('gameData', { game, fields, auction, secretInfo });
  }

  @UseGuards(WsGuard)
  @SubscribeMessage('createGame')
  async createGame(socket: Socket) {
    const createdGameWithPlayer = await this.gameService.createGame(
      socket.data.jwtPayload.sub
    );
    socket.join(createdGameWithPlayer.id);
    return this.server.emit('newGameCreated', createdGameWithPlayer);
  }

  @UseGuards(WsGuard)
  @SubscribeMessage('joinGame')
  async onJoinGame(socket: Socket, dataArray: [{ id: string }, null]) {
    const data = dataArray[0];
    const game = await this.gameService.joinGame(
      data.id,
      socket.data.jwtPayload.sub
    );
    this.leaveAllRoomsExceptInitial(socket);
    socket.join(data.id);
    if (game.status === 'ACTIVE') {
      this.gameService.startGame(game);
    }

    this.server.emit('onParticipateGame', game);
  }

  @UseGuards(WsGuard)
  @SubscribeMessage('leaveGame')
  async onLeaveGame(
    socket: Socket & { jwtPayload: JwtPayload; user: JwtPayload },
    dataArray: [{ id: string }, null]
  ) {
    const data = dataArray[0];
    const game = await this.gameService.leaveGame(
      data.id,
      socket.data.jwtPayload.sub
    );
    if (game) {
      this.leaveAllRoomsExceptInitial(socket);
      this.server.emit('onParticipateGame', {
        id: data.id,
        ...game,
      });
    }
  }

  @UseGuards(ValidPlayerGuard, TurnGuard)
  @SubscribeMessage('rollDice')
  async onRollDice(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.gameService.rollDice(socket.game);
  }

  @UseGuards(ValidPlayerGuard)
  @SubscribeMessage('payToBankForSpecialField')
  async onPayToBankForSpecialField(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.gameService.payToBankForSpecialField(
      socket.data.jwtPayload.sub,
      socket.game
    );
  }

  @UseGuards(ValidPlayerGuard)
  @SubscribeMessage('payToUserForSecret')
  async onPayToUserForSecret(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    const game = socket.game;
    const userId = socket.data.jwtPayload.sub;
    const { game: updatedGame, secretInfo } =
      await this.gameService.payToUserForSecret(game, userId);
    this.server.to(game.id).emit('updatePlayers', {
      game: updatedGame,
      secretInfo,
    });
  }

  @UseGuards(ValidPlayerGuard)
  @SubscribeMessage('payToBankForSecret')
  async onPayToBankForSecret(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    const game = socket.game;
    const userId = socket.data.jwtPayload.sub;
    await this.gameService.payToBankForSecret(game, userId);
  }

  @UseGuards(ValidPlayerGuard, TurnGuard)
  @SubscribeMessage('payForPrivateField')
  async onPayForPrivateField(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.gameService.payForPrivateField(socket.game);
  }

  @UseGuards(ValidPlayerGuard, TurnGuard)
  @SubscribeMessage('putUpForAuction')
  async onPutUpForAuction(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.gameService.putUpForAuction(socket.game);
  }

  @UseGuards(ValidPlayerGuard)
  @SubscribeMessage('raisePrice')
  async raisePrice(
    @ConnectedSocket() socket: Socket & { jwtPayload: JwtPayload },
    @GetGameId() gameId: string,
    @MessageBody() dataArray: [{ raiseBy: number; bidAmount: number }, null]
  ) {
    const data = dataArray[0];
    const userId = socket.data.jwtPayload.sub;
    await this.auctionService.raisePrice(
      gameId,
      userId,
      data.raiseBy,
      data.bidAmount
    );
  }

  @UseGuards(ValidPlayerGuard)
  @SubscribeMessage('refuseAuction')
  async refuseAuction(
    @ConnectedSocket() socket: Socket & { jwtPayload: JwtPayload },
    @GetGameId() gameId: string
  ) {
    const userId = socket.data.jwtPayload.sub;
    await this.auctionService.refuseAuction(gameId, userId);
  }

  @UseGuards(ValidPlayerGuard, TurnGuard)
  @SubscribeMessage('buyField')
  async onBuyField(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.gameService.buyField(socket.game);
  }

  @UseGuards(ValidPlayerGuard, TurnGuard)
  @SubscribeMessage('passTurn')
  async onPassTurn(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.gameService.passTurn(socket.game);
  }

  @UseGuards(ValidPlayerGuard)
  @SubscribeMessage('buyBranch')
  async onBuyBranch(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload },
    @MessageBody() dataArray: [{ index: number }, null]
  ) {
    const data = dataArray[0];
    const index = data.index;
    const game = socket.game;
    const userId = socket.data.jwtPayload.sub;
    const { updatedGame, fields } = await this.gameService.buyBranch(
      game,
      index,
      userId
    );
    this.server
      .to(game.id)
      .emit('updateGameData', { fields, game: updatedGame });
  }

  @UseGuards(ValidPlayerGuard)
  @SubscribeMessage('sellBranch')
  async onSellBranch(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload },
    @MessageBody() dataArray: [{ index: number }, null]
  ) {
    const data = dataArray[0];
    const index = data.index;
    const game = socket.game;
    const userId = socket.data.jwtPayload.sub;
    const { updatedGame, fields } = await this.gameService.sellBranch(
      game,
      index,
      userId
    );
    this.server
      .to(game.id)
      .emit('updateGameData', { fields, game: updatedGame });
  }

  @UseGuards(ValidPlayerGuard)
  @SubscribeMessage('surrender')
  async surrender(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload }
  ) {
    const userId = socket.data.jwtPayload.sub;
    const gameId = socket.game.id;

    const { updatedPlayer, updatedFields } = await this.gameService.loseGame(
      userId,
      gameId
    );

    this.server.to(gameId).emit('playerSurrendered', {
      game: updatedPlayer.game,
      fields: updatedFields,
    });
  }

  @UseGuards(ValidPlayerGuard)
  @SubscribeMessage('mortgageField')
  async onMortgageField(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload },
    @MessageBody() dataArray: [{ index: number }, null]
  ) {
    const data = dataArray[0];
    const index = data.index;
    const game = socket.game;
    const { player, fields } = await this.gameService.mortgageField(
      game,
      index,
      socket.data.jwtPayload.sub
    );
    this.server
      .to(game.id)
      .emit('updateGameData', { fields, game: player.game });
  }
}
