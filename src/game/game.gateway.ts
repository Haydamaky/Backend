import { GetGameId } from './decorators/getGameCookieWs';
import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
  WsException,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { GameService } from './game.service';
import { Server, Socket } from 'socket.io';
import {
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { GamePayload } from './game.repository';
import { parse } from 'cookie';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
@UseFilters(WebsocketExceptionsFilter)
@UsePipes(new WsValidationPipe())
@UseGuards(WsGuard)
export class GameGateway {
  constructor(private gameService: GameService) {
    this.rollDice = this.rollDice.bind(this);
    this.startTradeField = this.startTradeField.bind(this);
    this.tradeField = this.tradeField.bind(this);
  }

  @WebSocketServer() server: Server;

  async handleConnection(
    @ConnectedSocket() socket: Socket & { jwtPayload: JwtPayload }
  ) {
    if (!socket.handshake.headers.cookie) return;
    const cookies = parse(socket.handshake.headers.cookie);
    const gameId = cookies.gameId;
    if (!gameId) return;
    const game = await this.gameService.findGameWithPlayers(gameId);
    if (game.status !== 'ACTIVE') return;
    const timers = this.gameService.rollTimers;
    if (timers.has(gameId)) {
      socket.emit('rejoin', {
        turnEnds: game.turnEnds,
        turnOfUserId: game.turnOfUserId,
        dices: game.dices,
      });
      return;
    }
    const turnEnds = this.gameService.calculateEndOfTurn(game.timeOfTurn);
    socket.emit('rejoin', {
      turnEnds: turnEnds,
      turnOfUserId: game.turnOfUserId,
      dices: game.dices,
    });
    this.gameService.setTimer(game, this.rollDice);
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

  @SubscribeMessage('joinGame')
  async onJoinGame(
    socket: Socket & { jwtPayload: JwtPayload },
    data: { id: string }
  ) {
    const { game, shouldStart } = await this.gameService.onJoinGame(
      data.id,
      socket.jwtPayload.sub
    );
    if (game) {
      this.leaveAllRoomsExceptInitial(socket);
      socket.join(data.id);
      this.server.emit('onParticipateGame', {
        id: game.id,
        players: game.players,
      });
      if (shouldStart) {
        // We can setTimeout here for some countdown on frontend
        this.server.emit('clearStartedGame', {
          gameId: game.id,
        });
        this.server.to(game.id).emit('startGame', {
          gameId: game.id,
          turnOfUserId: game.turnOfUserId,
        });
        this.gameService.setTimer(game, this.rollDice);
      }
    }
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

  @SubscribeMessage('rollDice')
  async onRollDice(
    @ConnectedSocket() socket: Socket & { jwtPayload: JwtPayload },
    @GetGameId() gameId: string
  ) {
    const game = await this.gameService.getCurrentGame(gameId);
    if (game.turnOfUserId !== socket.jwtPayload.sub)
      throw new WsException('Wrong turn');
    this.rollDice(game);
  }

  async rollDice(game: Partial<GamePayload>) {
    const dices = this.gameService.onRollDice();
    const turnEnds = this.gameService.calculateEndOfTurn(game.timeOfTurn);
    await this.gameService.updateById(game.id, {
      dices,
      turnEnds,
    });
    this.server.to(game.id).emit('rolledDice', {
      dices,
      turnEnds,
    });
    this.gameService.setTimer(game, this.startTradeField);
  }

  async startTradeField(game: Partial<GamePayload>) {
    const turnEnds = this.gameService.calculateEndOfTurn(game.timeOfTurn);
    this.server.to(game.id).emit('startTradeField', {
      turnEnds,
    });
    this.gameService.setTimer(game, this.tradeField);
  }

  async tradeField(game: Partial<GamePayload>) {
    // Logic of buying field
    const { turnOfNextUserId } = this.gameService.findNextTurnUser(game);
    const gameWithNextTurn = await this.gameService.updateById(game.id, {
      turnOfUserId: turnOfNextUserId,
      dices: '',
    });
    this.server
      .to(game.id)
      .emit('tradedField', { turnOfNextUserId, dices: '' });
    this.gameService.setTimer(gameWithNextTurn, this.rollDice);
  }
}
