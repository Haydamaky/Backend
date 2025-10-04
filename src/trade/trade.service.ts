import { Injectable } from '@nestjs/common';
import { GamePayload } from 'src/game/game.repository';
import { GameService } from 'src/game/game.service';
import { Trade } from 'src/game/types/trade.type';
import { OfferTradeDto } from './dto/offer-trade.dto';
import { WebSocketProvider } from 'src/webSocketProvider/webSocketProvider.service';
import { FieldService } from 'src/field/field.service';
import { ChatService } from 'src/chat/chat.service';
import { TimerService } from 'src/timer/timers.service';
import { WsException } from '@nestjs/websockets';
import { PlayerService } from 'src/player/player.service';

@Injectable()
export class TradeService {
  trades: Map<string, Trade> = new Map();
  constructor(
    private gameService: GameService,
    private webSocketProvider: WebSocketProvider,
    private fieldService: FieldService,
    private chatService: ChatService,
    private timerService: TimerService,
    private playerService: PlayerService
  ) {
    this.refuseFromTrade = this.refuseFromTrade.bind(this);
  }
  setTrade(gameId: string, trade: Trade) {
    this.trades.set(gameId, trade);
  }
  getTrade(gameId: string) {
    return this.trades.get(gameId);
  }

  async validateTradeData(
    game: Partial<GamePayload>,
    data: OfferTradeDto,
    requestId: string
  ) {
    if (
      data.offerFieldsIndexes.length === 0 &&
      data.wantedFieldsIndexes.length === 0 &&
      data.offeredMoney <= 0 &&
      data.wantedMoney <= 0
    ) {
      throw new WsException({ message: 'Invalid trade data', requestId });
    }
    const fields = await this.fieldService.getGameFields(game.id);
    if (data.offerFieldsIndexes.length > 0) {
      const userFields = fields.filter(
        (field) => field.ownedBy === game.turnOfUserId
      );
      const userFieldsIndexes = userFields.map((field) => field.index);
      const hasAllOfferFields = data.offerFieldsIndexes.every((index) =>
        userFieldsIndexes.includes(index)
      );
      if (!hasAllOfferFields) {
        throw new WsException({
          message: 'You dont have all offer fields',
          requestId,
        });
      }
    }
    if (data.wantedFieldsIndexes.length > 0) {
      const otherUserFields = fields.filter(
        (field) => field.ownedBy === data.toUserId
      );
      const otherUserFieldsIndexes = otherUserFields.map(
        (field) => field.index
      );
      const hasAllWantedFields = data.wantedFieldsIndexes.every((index) =>
        otherUserFieldsIndexes.includes(index)
      );
      if (!hasAllWantedFields) {
        throw new WsException({
          message: 'The other player does not have all wanted fields',
          requestId,
        });
      }
    }
  }

  async handleOfferTrade(data: {
    game: Partial<GamePayload>;
    trade: Trade;
    requestId: string;
  }) {
    const { updatedGame } = await this.gameService.passTurnToUser({
      game: data.game,
      toUserId: data.trade.toUserId,
    });
    this.webSocketProvider.server
      .to(data.game.id)
      .emit('updateGameData', { game: updatedGame, requestId: data.requestId });
    this.webSocketProvider.server
      .to(data.trade.toUserId)
      .emit('tradeOffered', { trade: data.trade, requestId: data.requestId });
    this.timerService.set(
      updatedGame.id,
      10000,
      updatedGame,
      this.refuseFromTrade
    );
  }

  async acceptTrade(
    game: Partial<GamePayload>,
    trade: Trade,
    userId: string,
    requestId: string
  ) {
    if (!trade)
      throw new WsException({
        message: 'There is no trade to accept',
        requestId,
      });
    if (trade.toUserId !== userId)
      throw new WsException({
        message: 'You are not allowed to accept this trade',
        requestId,
      });
    this.timerService.clear(game.id);
    const fields = await this.fieldService.getGameFields(game.id);
    if (trade.offerFieldsIndexes.length > 0) {
      trade.offerFieldsIndexes.forEach((index) => {
        const field = this.fieldService.findPlayerFieldByIndex(fields, index);
        field.ownedBy = trade.toUserId;
      });
    }
    if (trade.wantedFieldsIndexes.length > 0) {
      trade.wantedFieldsIndexes.forEach((index) => {
        const field = this.fieldService.findPlayerFieldByIndex(fields, index);
        field.ownedBy = trade.fromUserId;
      });
    }
    if (trade.offerFieldsIndexes.length || trade.wantedFieldsIndexes) {
      await this.fieldService.updateFields(fields, ['ownedBy']);
    }
    let player = null;
    if (trade.offeredMoney) {
      this.playerService.decrementMoneyWithUserAndGameId(
        trade.fromUserId,
        game.id,
        trade.offeredMoney
      );
      player = await this.playerService.incrementMoneyWithUserAndGameId(
        trade.toUserId,
        game.id,
        trade.offeredMoney
      );
    }
    if (trade.wantedMoney) {
      this.playerService.decrementMoneyWithUserAndGameId(
        trade.toUserId,
        game.id,
        trade.wantedMoney
      );
      player = await this.playerService.incrementMoneyWithUserAndGameId(
        trade.fromUserId,
        game.id,
        trade.wantedMoney
      );
    }
    this.setTrade(game.id, null);
    const { updatedGame } = await this.gameService.passTurnToUser({
      game: player?.game ? player.game : game,
      toUserId: trade.fromUserId,
    });
    return { fields, updatedGame };
  }

  async refuseFromTrade(game: Partial<GamePayload>, requestId?: string) {
    const trade = this.getTrade(game.id);
    if (!trade)
      throw new WsException({
        message: 'There is no trade to refuse',
        requestId,
      });
    this.setTrade(game.id, null);

    const { updatedGame } = await this.gameService.passTurnToUser({
      game,
      toUserId: trade.fromUserId,
      turnTime: game.timeOfTurn,
    });
    this.webSocketProvider.server
      .to(game.id)
      .emit('updateGameData', { game: updatedGame });
    const toPlayer = game.players.find(
      (player) => player.userId === trade.toUserId
    );
    const message = await this.chatService.onNewMessage(game.turnOfUserId, {
      text: `${toPlayer.user.nickname} відхилив угоду!`,
      chatId: game.chat.id,
    });
    this.webSocketProvider.server
      .to(game.id)
      .emit('gameChatMessage', { requestId, ...message });
  }
}
