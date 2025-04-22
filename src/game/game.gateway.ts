import {
  forwardRef,
  Inject,
  UseFilters,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
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
import { HasLostGuard } from 'src/auth/guard';
import { ActiveGameGuard } from 'src/auth/guard/activeGame.guard';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { TurnGuard } from 'src/auth/guard/turn.guard';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { FieldService } from 'src/field/field.service';
import { PaymentService } from 'src/payment/payment.service';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { PlayerService } from 'src/player/player.service';
import { SecretService } from 'src/secret/secret.service';
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
@UseGuards(WsGuard)
export class GameGateway {
  constructor(
    @Inject(forwardRef(() => GameService))
    private gameService: GameService,
    private webSocketProvider: WebSocketProvider,
    private playerService: PlayerService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auctionService: AuctionService,
    private timerService: TimerService,
    @Inject(forwardRef(() => SecretService))
    private secretService: SecretService,
    private paymentService: PaymentService,
    private fieldService: FieldService
  ) {}
  @WebSocketServer()
  readonly server: Server;
  afterInit(server: Server) {
    this.webSocketProvider.setServer(server);
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
  async onGetVisibleGames() {
    const games = await this.gameService.getVisibleGames();
    return games;
  }

  @SubscribeMessage('getGameData')
  async onGetGameData(@GetGameId() gameId: string) {
    const game = await this.gameService.getGame(gameId);
    const auction = this.auctionService.auctions.get(game.id);
    const secretInfo = this.secretService.secrets.get(game.id);
    const fields = await this.fieldService.getGameFields(game.id);
    this.server.emit('gameData', { game, fields, auction, secretInfo });
  }

  @SubscribeMessage('createGame')
  async createGame(socket: Socket & { jwtPayload: JwtPayload }) {
    const createdGameWithPlayer = await this.gameService.createGame(
      socket.jwtPayload.sub
    );
    socket.join(createdGameWithPlayer.id);
    return this.server.emit('newGameCreated', createdGameWithPlayer);
  }

  @SubscribeMessage('joinGame')
  async onJoinGame(
    socket: Socket & { jwtPayload: JwtPayload },
    data: { id: string }
  ) {
    const game = await this.gameService.joinGame(
      data.id,
      socket.jwtPayload.sub
    );
    this.leaveAllRoomsExceptInitial(socket);
    socket.join(data.id);
    this.server.emit('onParticipateGame', game);
  }

  @SubscribeMessage('leaveGame')
  async onLeaveGame(
    socket: Socket & { jwtPayload: JwtPayload },
    data: { id: string }
  ) {
    const game = await this.gameService.leaveGame(
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
    await this.gameService.rollDice(socket.game);
  }

  @UseGuards(ActiveGameGuard, HasLostGuard)
  @SubscribeMessage('payToUserForSecret')
  async onPayToUserForSecret(
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
  @SubscribeMessage('payToBank')
  async onPayToBank(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.gameService.payToBank(socket.jwtPayload.sub, socket.game);
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('payForField')
  async onPayForField(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.gameService.payForField(socket.game);
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('putUpForAuction')
  async onPutUpForAuction(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.gameService.putUpForAuction(socket.game);
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
    await this.auctionService.raisePrice(gameId, userId, raiseBy, bidAmount);
  }

  @UseGuards(ActiveGameGuard, HasLostGuard)
  @SubscribeMessage('refuseAuction')
  async refuseAuction(
    @ConnectedSocket() socket: Socket & { jwtPayload: JwtPayload },
    @GetGameId() gameId: string
  ) {
    const userId = socket.jwtPayload.sub;
    await this.auctionService.refuseAuction(gameId, userId);
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('buyField')
  async onBuyField(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.gameService.buyField(socket.game);
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('passTurn')
  async onPassTurn(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.gameService.passTurnToNext(socket.game);
  }
}
