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
import { fields } from 'src/utils/fields';
import { PlayerService } from 'src/player/player.service';
import { Auction } from './types/auction.type';

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
  constructor(
    private gameService: GameService,
    private playerService: PlayerService
  ) {
    this.rollDice = this.rollDice.bind(this);
    this.putUpForAuction = this.putUpForAuction.bind(this);
    this.passTurnToNext = this.passTurnToNext.bind(this);
    this.winAuction = this.winAuction.bind(this);
  }

  @WebSocketServer() server: Server;

  async handleConnection(socket: Socket & { jwtPayload: JwtPayload }) {
    const gameId = this.extractGameIdCookie(socket);
    const game = await this.gameService.findGameWithPlayers(gameId);

    if (!game || game.status !== 'ACTIVE') return;

    const timers = this.gameService.timers;
    if (timers.has(gameId)) {
      this.rejoinGame(socket, gameId);
      return;
    }

    const updatedGame = await this.gameService.updateGameWithNewTurn(game);

    this.rejoinGame(socket, gameId);

    const timerCallback = game.dices ? this.putUpForAuction : this.rollDice;

    this.gameService.setTimer(
      gameId,
      game.timeOfTurn,
      updatedGame,
      timerCallback
    );
  }

  private extractGameIdCookie(socket: Socket & { jwtPayload: JwtPayload }) {
    const cookies = socket.handshake.headers.cookie
      ? parse(socket.handshake.headers.cookie)
      : null;

    if (!cookies?.gameId) return;

    const { gameId } = cookies;
    return gameId;
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

  @SubscribeMessage('getGameData')
  async getGameData(@GetGameId() gameId: string) {
    const game = await this.gameService.findGameWithPlayers(gameId);
    return { game, fields };
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
        this.gameService.setTimer(
          game.id,
          game.timeOfTurn,
          game,
          this.rollDice
        );
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
    this.gameService.clearTimer(gameId);
    this.rollDice(game);
  }

  async rollDice(game: Partial<GamePayload>) {
    const { updatedGame, nextIndex } = await this.gameService.makeTurn(game);
    this.server.to(game.id).emit('rolledDice', {
      dices: updatedGame.dices,
      turnEnds: updatedGame.turnEnds,
      fields,
      moveToIndex: nextIndex,
    });
    this.gameService.setTimer(
      game.id,
      game.timeOfTurn,
      updatedGame,
      this.putUpForAuction
    );
  }

  @SubscribeMessage('putUpForAuction')
  async onPutUpForAuction(
    @ConnectedSocket() socket: Socket & { jwtPayload: JwtPayload },
    @GetGameId() gameId: string
  ) {
    const userId = socket.jwtPayload.sub;
    const game = await this.gameService.getCurrentGame(gameId);
    if (game.turnOfUserId !== userId) throw new WsException('Wrong turn');
    this.gameService.clearTimer(gameId);
    this.putUpForAuction(game);
  }

  async putUpForAuction(game: Partial<GamePayload>) {
    this.gameService.createAuction(game);
    const updatedGame = await this.gameService.updateGameWithNewTurn(
      game,
      5000
    );
    this.server
      .to(game.id)
      .emit('hasPutUpForAuction', { turnEnds: updatedGame.turnEnds });
    this.gameService.setTimer(game.id, 5000, updatedGame, this.passTurnToNext);
  }

  @SubscribeMessage('raisePrice')
  async raisePrice(
    @ConnectedSocket() socket: Socket & { jwtPayload: JwtPayload },
    @GetGameId() gameId: string,
    @MessageBody('raiseBy') raiseBy: number
  ) {
    const userId = socket.jwtPayload.sub;
    const { auctionUpdated, turnEnds } = await this.gameService.raisePrice(
      gameId,
      userId,
      raiseBy
    );
    this.server.to(gameId).emit('raisedPrice', { turnEnds, auctionUpdated });
    this.gameService.setTimer(
      gameId,
      3000,
      { ...auctionUpdated, gameId },
      this.winAuction
    );
  }

  async winAuction(auction: Auction & { gameId: string }) {
    const updatedPlayer = await this.gameService.winAuction(auction);
    this.server
      .to(auction.gameId)
      .emit('wonAuction', { auction, updatedPlayer, fields });
    const game = await this.gameService.findGameWithPlayers(auction.gameId);
    this.passTurnToNext(game);
  }

  async passTurnToNext(game: Partial<GamePayload>) {
    const { turnEnds, turnOfNextUserId, updatedGame, dices } =
      await this.gameService.passTurnToNext(game);
    this.server
      .to(game.id)
      .emit('passTurnToNext', { turnOfNextUserId, dices, turnEnds });
    this.gameService.setTimer(
      game.id,
      game.timeOfTurn,
      updatedGame,
      this.rollDice
    );
  }
}
