import {
  forwardRef,
  Inject,
  UseFilters,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { HasLostGuard, TurnGuard } from 'src/auth/guard';
import { ActiveGameGuard } from 'src/auth/guard/activeGame.guard';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { ChatService } from 'src/chat/chat.service';
import { EventService } from 'src/event/event.service';
import { GamePayload } from 'src/game/game.repository';
import { GameService } from 'src/game/game.service';
import { Trade } from 'src/game/types/trade.type';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { WebSocketServerService } from 'src/webSocketServer/webSocketServer.service';
import { OfferTradeDto } from './dto/offer-trade.dto';
import { PlayerService } from './player.service';

@WebSocketGateway({
  cors: {
    origin:
      'https://monopoly-front-2bsz61nx7-tarasblatnois-projects.vercel.app',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
@UseFilters(WebsocketExceptionsFilter)
@UsePipes(new WsValidationPipe())
@UseGuards(WsGuard, ActiveGameGuard, HasLostGuard)
export class PlayerGateway implements OnGatewayInit {
  constructor(
    private readonly playerService: PlayerService,
    private eventService: EventService,
    private webSocketServerService: WebSocketServerService,
    @Inject(forwardRef(() => GameService))
    private readonly gameService: GameService,
    private chatService: ChatService
  ) {}
  @WebSocketServer()
  private server: Server;

  afterInit(server: Server) {
    this.webSocketServerService.setServer(server);
  }
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
    const fields = await this.gameService.getGameFields(game.id);
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
    const fields = await this.gameService.getGameFields(game.id);
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

  @UseGuards(TurnGuard)
  @SubscribeMessage('offerTrade')
  async offerTrade(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload },
    @MessageBody()
    data: OfferTradeDto
  ) {
    const game = socket.game;
    const userId = socket.jwtPayload.sub;
    if (this.gameService.getAuction(game.id))
      throw new WsException('Cannot offer trade while auction');
    await this.playerService.validateTradeData(game, data);
    const trade = { ...data, fromUserId: userId } as Trade;
    this.playerService.setTrade(game.id, trade);
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
    this.server.to(game.id).emit('gameChatMessage', message);
    this.eventService.emitGameEvent('offerTrade', { game, trade });
  }

  @SubscribeMessage('refuseFromTrade')
  async refuseFromTrade(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload }
  ) {
    const game = socket.game;
    this.playerService.refuseFromTrade(game);
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
      trade,
      socket.jwtPayload.sub
    );
    const data = { fields };

    const { updatedGame: secondTimeUpdatedGame } =
      await this.gameService.passTurnToUser({
        game: updatedGame,
        toUserId: trade.fromUserId,
      });
    if (secondTimeUpdatedGame) {
      data['game'] = secondTimeUpdatedGame;
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
    this.server.to(game.id).emit('gameChatMessage', message);
    this.server.to(game.id).emit('updateGameData', data);
  }

  @SubscribeMessage('surrender')
  async surrender(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload }
  ) {
    const userId = socket.jwtPayload.sub;
    const gameId = socket.game.id;
    const fields = await this.gameService.getGameFields(socket.game.id);
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
