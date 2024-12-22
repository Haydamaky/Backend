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
import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { GamePayload } from './game.repository';
import { parse } from 'cookie';
import { fields, FieldType } from 'src/utils/fields';
import { PlayerService } from 'src/player/player.service';
import { Auction } from './types/auction.type';
import { TurnGuard } from 'src/auth/guard/turn.guard';

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
    this.payForField = this.payForField.bind(this);
  }

  @WebSocketServer() server: Server;

  async handleConnection(socket: Socket & { jwtPayload: JwtPayload }) {
    try {
      const gameId = this.extractGameIdCookie(socket);
      if (!gameId) return;
      const game = await this.gameService.getGame(gameId);
      if (!game || game.status !== 'ACTIVE') return;
      const timers = this.gameService.timers;
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

      await this.gameService.setTimer(
        gameId,
        updatedGame.timeOfTurn,
        updatedGame,
        timerCallback
      );
    } catch (err) {
      console.log(err);
    }
  }

  private extractGameIdCookie(socket: Socket & { jwtPayload: JwtPayload }) {
    const cookies = socket.handshake.headers.cookie
      ? parse(socket.handshake.headers.cookie)
      : null;

    if (!cookies?.gameId) return null;

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

  @SubscribeMessage('getVisibleGames')
  async getVisibleGames() {
    const games = await this.gameService.getVisibleGames();
    return games;
  }

  @SubscribeMessage('getGameData')
  async getGameData(@GetGameId() gameId: string) {
    const game = await this.gameService.getGame(gameId);
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

  @UseGuards(TurnGuard)
  @SubscribeMessage('rollDice')
  async onRollDice(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    if (socket.game.dices)
      throw new WsException('You have already rolled dices');
    this.gameService.clearTimer(socket.game.id);
    await this.rollDice(socket.game);
  }

  async rollDice(game: Partial<GamePayload>) {
    const { updatedGame, nextIndex, playerNextField, hasOwner } =
      await this.gameService.makeTurn(game);
    this.server.to(game.id).emit('rolledDice', {
      dices: updatedGame.dices,
      turnEnds: updatedGame.turnEnds,
      fields,
      playerNextField,
      hasOwner,
      moveToIndex: nextIndex,
      game: updatedGame,
    });
    if (hasOwner) {
      this.gameService.setTimer(
        game.id,
        game.timeOfTurn,
        { game: updatedGame, field: playerNextField },
        this.payForField
      );
      return;
    }
    this.gameService.setTimer(
      game.id,
      game.timeOfTurn,
      updatedGame,
      playerNextField.price ? this.putUpForAuction : this.passTurnToNext
    );
  }

  @UseGuards(TurnGuard)
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
    this.gameService.clearTimer(socket.game.id);
    await this.payForField({ game: socket.game, field: currentField });
  }

  async payForField({
    game,
    field,
  }: {
    game: Partial<GamePayload>;
    field: FieldType;
  }) {
    const { updatedGame, payed, received } = await this.gameService.payForField(
      game,
      field
    );
    this.server
      .to(game.id)
      .emit('payedForField', { players: updatedGame.players, payed, received });
    this.passTurnToNext(updatedGame);
  }

  @UseGuards(TurnGuard)
  @SubscribeMessage('putUpForAuction')
  async onPutUpForAuction(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.putUpForAuction(socket.game);
  }

  async putUpForAuction(game: Partial<GamePayload>) {
    await this.gameService.putUpForAuction(game);

    const updatedGame = await this.gameService.updateGameWithNewTurn(
      game,
      5000
    );
    this.server
      .to(game.id)
      .emit('hasPutUpForAuction', { turnEnds: updatedGame.turnEnds });
    this.gameService.setTimer(game.id, 5000, updatedGame, this.passTurnToNext);
  }

  @SubscribeMessage('createGame')
  async createGame(
    @ConnectedSocket() socket: Socket & { jwtPayload: JwtPayload }
  ) {
    const createdGameWithPlayer = await this.gameService.createGame(
      socket.jwtPayload
    );

    if (!createdGameWithPlayer)
      return socket.emit('error', {
        message:
          'Ви вже знаходитесь в кімнаті, покиньте її щоб приєднатись до іншої',
      });

    socket.join(createdGameWithPlayer.id);

    return this.server.emit('newGameCreated', createdGameWithPlayer);
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
    if (this.gameService.getAuction(gameId)) {
      this.gameService.setTimer(
        gameId,
        3000,
        { ...auctionUpdated, gameId },
        this.winAuction
      );
    }
  }

  async winAuction(auction: Auction & { gameId: string }) {
    const updatedPlayer = await this.gameService.winAuction(auction);
    this.server
      .to(auction.gameId)
      .emit('wonAuction', { auction, updatedPlayer, fields });
    const game = await this.gameService.getGame(auction.gameId);
    this.passTurnToNext(game);
  }

  @UseGuards(TurnGuard)
  @SubscribeMessage('buyField')
  async onBuyField(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.buyField(socket.game);
  }

  async buyField(game: Partial<GamePayload>) {
    const { updatedPlayer } = await this.gameService.buyField(game);
    this.server
      .to(game.id)
      .emit('boughtField', { player: updatedPlayer, fields });
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
