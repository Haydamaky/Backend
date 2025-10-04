import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WsException,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ValidPlayerGuard, TurnGuard } from 'src/auth/guard';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { GamePayload } from 'src/game/game.repository';
import { OfferTradeDto } from './dto/offer-trade.dto';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { AuctionService } from 'src/auction/auction.service';
import { TradeService } from './trade.service';
import { WebSocketProvider } from 'src/webSocketProvider/webSocketProvider.service';
import { ChatService } from 'src/chat/chat.service';
import { Trade } from 'src/game/types/trade.type';

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
export class TradeGateway {
  constructor(
    private auctionService: AuctionService,
    private tradeService: TradeService,
    private webSocketProvider: WebSocketProvider,
    private chatService: ChatService
  ) {}
  @UseGuards(ValidPlayerGuard, TurnGuard)
  @SubscribeMessage('offerTrade')
  async offerTrade(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload },
    @MessageBody()
    data: { tradeOffer: OfferTradeDto; requestId: string }
  ) {
    const game = socket.game;
    const userId = socket.data.jwtPayload.sub;
    if (this.auctionService.getAuction(game.id))
      throw new WsException({
        message: 'Cannot offer trade while auction',
        requestId: data.requestId,
      });
    await this.tradeService.validateTradeData(
      game,
      data.tradeOffer,
      data.requestId
    );
    const trade = { ...data.tradeOffer, fromUserId: userId } as Trade;
    this.tradeService.setTrade(game.id, trade);
    const fromPlayer = game.players.find(
      (player) => player.userId === trade.fromUserId
    );
    const toPlayer = game.players.find(
      (player) => player.userId === trade.toUserId
    );
    const message = await this.chatService.onNewMessage(game.turnOfUserId, {
      text: `${fromPlayer.user.nickname} запропонував ${toPlayer.user.nickname} угоду!`,
      chatId: game.chat.id,
    });
    this.webSocketProvider.server.to(game.id).emit('gameChatMessage', message);
    this.tradeService.handleOfferTrade({
      game,
      trade,
      requestId: data.requestId,
    });
  }

  @UseGuards(ValidPlayerGuard)
  @SubscribeMessage('refuseFromTrade')
  async refuseFromTrade(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload },
    @MessageBody() data: { requestId: string }
  ) {
    const game = socket.game;
    this.tradeService.refuseFromTrade(game, data.requestId);
  }

  @UseGuards(ValidPlayerGuard)
  @SubscribeMessage('acceptTrade')
  async acceptTrade(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload },
    @MessageBody() data: { requestId: string }
  ) {
    const game = socket.game;
    const trade = this.tradeService.getTrade(game.id);
    const { updatedGame, fields } = await this.tradeService.acceptTrade(
      game,
      trade,
      socket.data.jwtPayload.sub,
      data.requestId
    );
    const gameData = { fields };
    gameData['requestId'] = data.requestId;
    if (updatedGame) {
      gameData['game'] = updatedGame;
    }
    const fromPlayer = game.players.find(
      (player) => player.userId === trade.fromUserId
    );
    const toPlayer = game.players.find(
      (player) => player.userId === trade.toUserId
    );
    const message = await this.chatService.onNewMessage(game.turnOfUserId, {
      text: `Угода між ${fromPlayer.user.nickname} та ${toPlayer.user.nickname} підписана!`,
      chatId: game.chat.id,
    });
    this.webSocketProvider.server.to(game.id).emit('gameChatMessage', message);
    this.webSocketProvider.server.to(game.id).emit('updateGameData', gameData);
  }
}
