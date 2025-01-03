import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { PlayerService } from './player.service';
import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { Server, Socket } from 'socket.io';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { GamePayload } from 'src/game/game.repository';
import { fields } from 'src/utils/fields';
import { OfferTradeDto } from './dto/offer-trade.dto';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';

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
export class PlayerGateway {
  constructor(private readonly playerService: PlayerService) {}
  @WebSocketServer() server: Server;
  @SubscribeMessage('buyBranch')
  async buyBranch(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload> },
    @MessageBody('index') index: number
  ) {
    const game = socket.game;
    const fieldToBuyBranch = this.playerService.checkWhetherPlayerHasAllGroup(
      game,
      index
    );
    const player = await this.playerService.buyBranch(game, fieldToBuyBranch);
    this.server
      .to(game.id)
      .emit('playerBoughtBranch', { fields, game: player.game });
  }

  @SubscribeMessage('pledgeField')
  async pledgeField(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload> },
    @MessageBody('index') index: number
  ) {
    const game = socket.game;
    const player = await this.playerService.pledgeField(game, index);
    this.server
      .to(game.id)
      .emit('playerPledgedField', { fields, game: player.game });
  }

  @SubscribeMessage('payRedemptionForField')
  async payRedemptionForField(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload> },
    @MessageBody('index') index: number
  ) {
    const game = socket.game;
    const player = await this.playerService.payRedemptionForField(game, index);
    this.server.to(game.id).emit('payedRedemptionForField', {
      fields,
      game: player.game,
    });
  }

  @SubscribeMessage('offerTrade')
  async offerTrade(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload },
    @MessageBody()
    data: OfferTradeDto
  ) {
    const game = socket.game;
    const userId = socket.jwtPayload.sub;
    this.playerService.validateTradeData(game, data);
    this.server
      .to(data.toUserId)
      .emit('tradeOffered', { ...data, fromUserId: userId });
  }
}
