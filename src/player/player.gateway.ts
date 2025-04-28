import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { HasLostGuard, TurnGuard } from 'src/auth/guard';
import { ActiveGameGuard } from 'src/auth/guard/activeGame.guard';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { FieldService } from 'src/field/field.service';
import { GamePayload } from 'src/game/game.repository';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { PlayerService } from './player.service';

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
@UseGuards(WsGuard, ActiveGameGuard, HasLostGuard)
export class PlayerGateway {
  constructor(
    private readonly playerService: PlayerService,
    private fieldService: FieldService
  ) {}
  @WebSocketServer()
  private server: Server;
  @SubscribeMessage('buyBranch')
  async buyBranch(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload },
    @MessageBody('index') index: number
  ) {
    const game = socket.game;
    const userId = socket.jwtPayload.sub;
    const fieldToBuyBranch =
      await this.playerService.checkWhetherPlayerHasAllGroup(
        game,
        index,
        userId
      );
    this.playerService.checkFieldHasMaxBranches(fieldToBuyBranch);
    const updatedGame = await this.playerService.buyBranch(
      game,
      fieldToBuyBranch,
      socket.jwtPayload.sub
    );
    const fields = await this.fieldService.getGameFields(game.id);
    this.server
      .to(game.id)
      .emit('updateGameData', { fields, game: updatedGame });
  }

  @SubscribeMessage('sellBranch')
  async sellBranch(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload },
    @MessageBody('index') index: number
  ) {
    const game = socket.game;
    const userId = socket.jwtPayload.sub;
    const fields = await this.fieldService.getGameFields(game.id);
    const fieldToSellBranch =
      await this.playerService.checkWhetherPlayerHasAllGroup(
        game,
        index,
        userId,
        false
      );
    this.playerService.checkFieldHasBranches(fieldToSellBranch);
    const updatedGame = await this.playerService.sellBranch(
      game,
      fieldToSellBranch,
      socket.jwtPayload.sub
    );
    this.server
      .to(game.id)
      .emit('updateGameData', { fields, game: updatedGame });
  }

  @SubscribeMessage('pledgeField')
  async pledgeField(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload> },
    @MessageBody('index') index: number
  ) {
    const game = socket.game;
    const { player, fields } = await this.playerService.pledgeField(
      game,
      index
    );
    this.server
      .to(game.id)
      .emit('updateGameData', { fields, game: player.game });
  }

  @UseGuards(TurnGuard)
  @SubscribeMessage('payRedemptionForField')
  async payRedemptionForField(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload> },
    @MessageBody('index') index: number
  ) {
    const game = socket.game;
    const { player, fields } = await this.playerService.payRedemptionForField(
      game,
      index
    );
    this.server.to(game.id).emit('updateGameData', {
      fields,
      game: player.game,
    });
  }

  @SubscribeMessage('surrender')
  async surrender(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload }
  ) {
    const userId = socket.jwtPayload.sub;
    const gameId = socket.game.id;
    const fields = await this.fieldService.getGameFields(socket.game.id);
    const { updatedPlayer, updatedFields } = await this.playerService.loseGame(
      userId,
      gameId,
      fields
    );

    this.server.to(gameId).emit('playerSurrendered', {
      game: updatedPlayer.game,
      fields: updatedFields,
    });
  }
}
