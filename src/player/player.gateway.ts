import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { HasLostGuard } from 'src/auth/guard';
import { ActiveGameGuard } from 'src/auth/guard/activeGame.guard';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { GamePayload } from 'src/game/game.repository';
import { Trade } from 'src/game/types/trade.type';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { fields } from 'src/utils/fields';
import { OfferTradeDto } from './dto/offer-trade.dto';
import { PlayerService } from './player.service';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
@UseFilters(WebsocketExceptionsFilter)
@UsePipes(new WsValidationPipe())
@UseGuards(WsGuard, ActiveGameGuard, HasLostGuard)
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

  @SubscribeMessage('sellBranch')
  async sellBranch(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload> },
    @MessageBody('index') index: number
  ) {
    const game = socket.game;
    const fieldToSellBranch = this.playerService.checkWhetherPlayerHasAllGroup(
      game,
      index
    );
    this.playerService.checkFieldHasBranches(fieldToSellBranch);
    const player = await this.playerService.sellBranch(game, fieldToSellBranch);
    this.server
      .to(game.id)
      .emit('playerSoldBranch', { fields, game: player.game });
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
    const trade = { ...data, fromUserId: userId } as Trade;
    this.playerService.setTrade(game.id, trade);
    this.server
      .to(data.toUserId)
      .emit('tradeOffered', { ...data, fromUserId: userId });
  }

  @SubscribeMessage('refuseFromTrade')
  async refuseFromTrade(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload }
  ) {
    const game = socket.game;
    const trade = this.playerService.getTrade(game.id);
    if (!trade) throw new WsException('There is no trade to refuse');
    this.playerService.setTrade(game.id, null);
    this.server.to(trade.fromUserId).emit('tradeRefused', { trade });
  }

  @SubscribeMessage('acceptTrade')
  async acceptTrade(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload }
  ) {
    const game = socket.game;
    const trade = this.playerService.getTrade(game.id);
    const { updatedGame, fields } = await this.playerService.acceptTrade(
      game,
      trade
    );
    const data = { fields };
    if (updatedGame) {
      data['game'] = updatedGame;
    }
    this.server.to(game.id).emit('tradeAccepted', data);
  }

  @SubscribeMessage('surrender')
  async surrender(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload }
  ) {
    const userId = socket.jwtPayload.sub;
    const gameId = socket.game.id;
    const { updatedPlayer, fields } = await this.playerService.surrender(
      userId,
      gameId
    );
    this.server
      .to(gameId)
      .emit('playerSurrendered', { game: updatedPlayer.game, fields });
  }
}
