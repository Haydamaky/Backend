import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { CreatePlayerDto } from './dto/create-player.dto';
import { PlayerPayload, PlayerRepository } from './player.repository';
import { Prisma } from '@prisma/client';
import { GamePayload } from 'src/game/game.repository';
import { WsException } from '@nestjs/websockets';
import { OfferTradeDto } from './dto/offer-trade.dto';
import { Trade } from 'src/game/types/trade.type';
import { GameService } from 'src/game/game.service';
import { WebSocketServerService } from 'src/webSocketServer/webSocketServer.service';
import { ChatService } from 'src/chat/chat.service';
import { EventService } from 'src/event/event.service';
import { Field, FieldDocument } from 'src/schema/Field.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class PlayerService {
  constructor(
    @Inject(forwardRef(() => GameService))
    private readonly gameService: GameService,
    private playerRepository: PlayerRepository,
    private webSocketServerService: WebSocketServerService,
    private chatService: ChatService,
    private eventService: EventService,
    @InjectModel(Field.name) private fieldModel: Model<Field>
  ) {
    this.refuseFromTrade = this.refuseFromTrade.bind(this);
  }
  trades: Map<string, Trade> = new Map();
  readonly COLORS = ['blue', 'yellow', 'green', 'purple', 'red'];
  create(createPlayerDto: CreatePlayerDto) {
    return this.playerRepository.create({
      data: {
        color: createPlayerDto.color,
        userId: createPlayerDto.userId,
        gameId: createPlayerDto.gameId,
      },
      include: {
        game: {
          include: {
            players: {
              include: { user: { select: { nickname: true } } },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });
  }

  findFirst(query: Prisma.PlayerFindManyArgs) {
    return this.playerRepository.findFirst(query);
  }

  findByUserAndGameId(userId: string, gameId: string) {
    return this.playerRepository.findFirst({
      where: { userId, gameId },
      include: {
        game: {
          include: {
            players: {
              include: { user: { select: { nickname: true } } },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });
  }

  updateById(
    playerId: string,
    fieldsToUpdate: Prisma.PlayerUpdateArgs['data']
  ) {
    return this.playerRepository.updateById(playerId, {
      data: fieldsToUpdate,
      include: {
        game: {
          include: {
            players: {
              include: { user: { select: { nickname: true } } },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });
  }

  update(updateArgs: Prisma.PlayerUpdateArgs) {
    return this.playerRepository.update(updateArgs);
  }

  decrementMoneyWithUserAndGameId(
    userId: string,
    gameId: string,
    amount: number
  ) {
    return this.update({
      where: {
        userId_gameId: {
          userId: userId,
          gameId: gameId,
        },
      },
      data: {
        money: {
          decrement: amount,
        },
      },
      include: {
        game: {
          include: {
            players: {
              include: { user: { select: { nickname: true } } },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });
  }

  incrementMoneyWithUserAndGameId(
    userId: string,
    gameId: string,
    amount: number
  ) {
    return this.update({
      where: {
        userId_gameId: {
          userId: userId,
          gameId: gameId,
        },
      },
      data: {
        money: {
          increment: amount,
        },
      },
      include: {
        game: {
          include: {
            players: {
              include: { user: { select: { nickname: true } } },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });
  }

  deleteById(playerId: string) {
    return this.playerRepository.deleteById(playerId);
  }

  estimateAssets(player: Partial<PlayerPayload>, fields: FieldDocument[]) {
    const ownedFields = fields.filter(
      (field) => field.ownedBy === player.userId
    );
    const pledgePricesOfOwnedFields = ownedFields.map(
      (field) => field.pledgePrice
    );
    const potentialAmountToPledge = pledgePricesOfOwnedFields.reduce(
      (finalAmout, currentAmount) => {
        return finalAmout + currentAmount;
      },
      0
    );
    return player.money + potentialAmountToPledge;
  }

  findPlayerFieldByIndex(fields: FieldDocument[], indexOfField: number) {
    return fields.find((field) => field.index === indexOfField);
  }

  findPlayerWithTurn(game: Partial<GamePayload>) {
    const player = game.players.find(
      (player) => player.userId === game.turnOfUserId
    );
    return player;
  }

  async checkWhetherPlayerHasAllGroup(
    game: Partial<GamePayload>,
    index: number,
    userId?: string,
    buying: boolean = true
  ) {
    const fields = await this.gameService.getGameFields(game.id);
    const playerUserId = userId ? userId : game.turnOfUserId;
    const userFields = fields.filter((field) => field.ownedBy === playerUserId);
    const userFieldsIndexes = userFields.map((field) => field.index);
    if (!userFieldsIndexes.includes(index))
      throw new WsException('You dont have this field');
    const fieldToBuyBranch = this.findPlayerFieldByIndex(fields, index);
    const groupFields = fields.filter(
      (f) => f.group === fieldToBuyBranch.group
    );
    const userGroupFields = userFields.filter(
      (f) => f.group === fieldToBuyBranch.group
    );
    if (groupFields.length !== userGroupFields.length)
      throw new WsException('You dont have all group fields');
    const isBuyingHotel = buying && fieldToBuyBranch.amountOfBranches === 4;
    const isBuyingHouse = buying && fieldToBuyBranch.amountOfBranches < 4;
    const isSellingHotel = !buying && fieldToBuyBranch.amountOfBranches === 5;

    if (isBuyingHotel && game.hotelsQty <= 0) {
      throw new WsException('You must have at least 1 hotel in the bank');
    }

    if (isBuyingHouse && game.housesQty <= 0) {
      throw new WsException('You must have at least 1 house in the bank');
    }

    if (isSellingHotel && game.housesQty < 4) {
      throw new WsException('You must have at least 4 houses in the bank');
    }

    if (buying && fieldToBuyBranch.isPledged) {
      throw new WsException('You cannot buy a branch for a pledged field');
    }

    this.checkBuyingOrSellingEvenly(groupFields, fieldToBuyBranch, buying);
    return fieldToBuyBranch;
  }

  checkBuyingOrSellingEvenly(
    groupOfFields: FieldDocument[],
    field: FieldDocument,
    buying: boolean
  ) {
    const buyingEvenly = groupOfFields.every((groupField) => {
      const probableDifferenceOfBranches = Math.abs(
        groupField.amountOfBranches -
          (field.amountOfBranches + (buying ? 1 : -1))
      );
      return (
        probableDifferenceOfBranches <= 1 && probableDifferenceOfBranches >= 0
      );
    });
    if (!buyingEvenly)
      throw new WsException('You must buy/sell branches evenly in group');
  }

  checkFieldHasMaxBranches(field: FieldDocument) {
    if (field.amountOfBranches >= 5)
      throw new WsException('This field has max amount of branches');
  }

  checkFieldHasBranches(field: FieldDocument) {
    if (field.amountOfBranches >= 6)
      throw new WsException('This field has max amount of branches');
    if (field.amountOfBranches <= 0) {
      throw new WsException('You do not have any branches to sell');
    }
  }

  async buyBranch(
    game: Partial<GamePayload>,
    fieldToBuyBranch: FieldDocument,
    userId: string
  ) {
    const playerToPay = game.players.find((player) => player.userId === userId);
    if (playerToPay.money < fieldToBuyBranch.branchPrice) {
      throw new WsException('You dont have enough money to buy branch');
    }
    const player = await this.decrementMoneyWithUserAndGameId(
      userId,
      game.id,
      fieldToBuyBranch.branchPrice
    );
    fieldToBuyBranch.amountOfBranches++;
    let updatedGame = null;
    if (fieldToBuyBranch.amountOfBranches === 5) {
      await this.gameService.decreaseHotels(player.game.id, 1);
      updatedGame = await this.gameService.increaseHouses(player.game.id, 4);
    } else {
      updatedGame = await this.gameService.decreaseHouses(player.game.id, 1);
    }
    await this.fieldModel.updateOne(
      { _id: fieldToBuyBranch._id },
      { $set: { amountOfBranches: fieldToBuyBranch.amountOfBranches } }
    );
    return updatedGame;
  }

  async sellBranch(
    game: Partial<GamePayload>,
    fieldToBuyBranch: FieldDocument,
    userId: string
  ) {
    const player = await this.incrementMoneyWithUserAndGameId(
      userId,
      game.id,
      fieldToBuyBranch.sellBranchPrice
    );
    fieldToBuyBranch.amountOfBranches--;
    let updatedGame = null;
    if (fieldToBuyBranch.amountOfBranches === 4) {
      await this.gameService.increaseHotels(player.game.id, 1);
      updatedGame = await this.gameService.decreaseHouses(player.game.id, 4);
    } else {
      updatedGame = await this.gameService.increaseHouses(player.game.id, 1);
    }
    await this.fieldModel.updateOne(
      { _id: fieldToBuyBranch._id },
      { $set: { amountOfBranches: fieldToBuyBranch.amountOfBranches } }
    );
    return updatedGame;
  }

  async pledgeField(
    game: Partial<GamePayload>,
    index: number,
    userId?: string
  ) {
    const fields = await this.gameService.getGameFields(game.id);
    const playerUserId = userId ? userId : game.turnOfUserId;
    const fieldToPledge = this.findPlayerFieldByIndex(fields, index);
    if (fieldToPledge.isPledged) {
      throw new WsException('Field is already pledged');
    }
    if (fieldToPledge.amountOfBranches > 0) {
      throw new WsException(
        'You must have some brances so you cant pledge the field'
      );
    }
    const player = await this.incrementMoneyWithUserAndGameId(
      playerUserId,
      game.id,
      fieldToPledge.pledgePrice
    );
    fieldToPledge.isPledged = true;
    fieldToPledge.turnsToUnpledge = game.turnsToUnpledge;
    await this.fieldModel.updateOne(
      { _id: fieldToPledge._id },
      { $set: { isPledged: true, turnsToUnpledge: game.turnsToUnpledge } }
    );
    return { player, fields };
  }

  async payRedemptionForField(
    game: Partial<GamePayload>,
    index: number,
    userId?: string
  ) {
    const playerUserId = userId ? userId : game.turnOfUserId;
    const fields = await this.gameService.getGameFields(game.id);
    const fieldToPayRedemption = this.findPlayerFieldByIndex(fields, index);
    if (!fieldToPayRedemption.isPledged) {
      throw new WsException('Field is not pledged');
    }
    fieldToPayRedemption.isPledged = false;
    fieldToPayRedemption.turnsToUnpledge = null;
    await this.fieldModel.updateOne(
      { _id: fieldToPayRedemption._id },
      { $set: { isPledged: false, turnsToUnpledge: null } }
    );
    const player = await this.decrementMoneyWithUserAndGameId(
      playerUserId,
      game.id,
      fieldToPayRedemption.redemptionPrice
    );
    return { player, fields };
  }

  async validateTradeData(game: Partial<GamePayload>, data: OfferTradeDto) {
    if (
      data.offerFieldsIndexes.length === 0 &&
      data.wantedFieldsIndexes.length === 0 &&
      data.offeredMoney <= 0 &&
      data.wantedMoney <= 0
    ) {
      throw new WsException('You must offer something');
    }
    const fields = await this.gameService.getGameFields(game.id);
    if (data.offerFieldsIndexes.length > 0) {
      const userFields = fields.filter(
        (field) => field.ownedBy === game.turnOfUserId
      );
      const userFieldsIndexes = userFields.map((field) => field.index);
      const hasAllOfferFields = data.offerFieldsIndexes.every((index) =>
        userFieldsIndexes.includes(index)
      );
      if (!hasAllOfferFields) {
        throw new WsException('You dont have all offer fields');
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
        throw new WsException('Other player doesnt have all wanted fields');
      }
    }
  }
  setTrade(gameId: string, trade: Trade) {
    this.trades.set(gameId, trade);
  }
  getTrade(gameId: string) {
    return this.trades.get(gameId);
  }
  async acceptTrade(game: Partial<GamePayload>, trade: Trade, userId: string) {
    if (!trade) throw new WsException('There is no trade to accept');
    if (trade.toUserId !== userId)
      throw new WsException('You cant accept this trade');
    this.gameService.clearTimer(game.id);
    const fields = await this.gameService.getGameFields(game.id);
    if (trade.offerFieldsIndexes.length > 0) {
      trade.offerFieldsIndexes.forEach((index) => {
        const field = this.findPlayerFieldByIndex(fields, index);
        field.ownedBy = trade.toUserId;
      });
    }
    if (trade.wantedFieldsIndexes.length > 0) {
      trade.wantedFieldsIndexes.forEach((index) => {
        const field = this.findPlayerFieldByIndex(fields, index);
        field.ownedBy = trade.fromUserId;
      });
    }
    if (trade.offerFieldsIndexes.length || trade.wantedFieldsIndexes) {
      await this.gameService.updateFields(fields, ['ownedBy']);
    }
    let player = null;
    if (trade.offeredMoney) {
      this.decrementMoneyWithUserAndGameId(
        trade.fromUserId,
        game.id,
        trade.offeredMoney
      );
      player = await this.incrementMoneyWithUserAndGameId(
        trade.toUserId,
        game.id,
        trade.offeredMoney
      );
    }
    if (trade.wantedMoney) {
      this.decrementMoneyWithUserAndGameId(
        trade.toUserId,
        game.id,
        trade.wantedMoney
      );
      player = await this.incrementMoneyWithUserAndGameId(
        trade.fromUserId,
        game.id,
        trade.wantedMoney
      );
    }
    this.setTrade(game.id, null);
    return { fields, updatedGame: player?.game ? player.game : game };
  }

  async refuseFromTrade(game: Partial<GamePayload>) {
    const trade = this.getTrade(game.id);
    if (!trade) throw new WsException('There is no trade to refuse');
    this.setTrade(game.id, null);

    const { updatedGame } = await this.gameService.passTurnToUser({
      game,
      toUserId: trade.fromUserId,
      turnTime: game.timeOfTurn,
    });
    this.webSocketServerService.server
      .to(game.id)
      .emit('updateGameData', { game: updatedGame });
    const toPlayer = game.players.find(
      (player) => player.userId === trade.toUserId
    );
    const message = await this.chatService.onNewMessage(game.turnOfUserId, {
      text: `${toPlayer.user.nickname} відхилив угоду!`,
      chatId: game.chat.id,
    });
    this.webSocketServerService.server
      .to(game.id)
      .emit('gameChatMessage', message);
  }

  async loseGame(userId: string, gameId: string, fields: FieldDocument[]) {
    this.gameService.clearTimer(gameId);
    const updatedPlayer = await this.update({
      where: {
        userId_gameId: {
          userId: userId,
          gameId: gameId,
        },
      },
      data: {
        lost: true,
      },
      include: {
        game: {
          include: {
            players: {
              include: { user: { select: { nickname: true } } },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });
    const updatedGame = await this.gameService.updateById(gameId, {
      dices: 'playerLost',
    });
    fields.forEach((field) => {
      if (field.ownedBy === updatedPlayer.userId) {
        field.ownedBy = null;
        field.amountOfBranches = 0;
        field.isPledged = false;
        field.turnsToUnpledge = null;
      }
    });
    await this.gameService.updateFields(fields, ['ownedBy']);
    if (this.gameService.hasWinner(updatedPlayer.game)) {
      this.gameService.clearTimer(updatedPlayer.game.id);
      const game = await this.gameService.updateById(updatedPlayer.game.id, {
        status: 'FINISHED',
      });
      this.webSocketServerService.server
        .to(game.id)
        .emit('playerWon', { game });
      return { updatedPlayer, fields };
    }
    this.eventService.emitGameEvent('passTurnToNext', {
      game: updatedGame,
    });
    return { updatedPlayer, updatedFields: fields };
  }
}
