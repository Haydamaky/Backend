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
  constructor(private readonly playerService: PlayerService) {}
  @WebSocketServer()
  private server: Server;

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
}
