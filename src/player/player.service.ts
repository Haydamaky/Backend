import { Injectable } from '@nestjs/common';
import { CreatePlayerDto } from './dto/create-player.dto';
import { PlayerPayload, PlayerRepository } from './player.repository';
import { Prisma } from '@prisma/client';
import { fields, FieldsType, FieldType } from 'src/utils/fields';
import { GamePayload } from 'src/game/game.repository';
import { WsException } from '@nestjs/websockets';
import { OfferTradeDto } from './dto/offer-trade.dto';

@Injectable()
export class PlayerService {
  constructor(private playerRepository: PlayerRepository) {}
  readonly COLORS = ['blue', 'yellow', 'red', 'green', 'pink'];
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
            players: { include: { user: { select: { nickname: true } } } },
          },
        },
      },
    });
  }

  findFirst(query: Prisma.PlayerFindManyArgs) {
    return this.playerRepository.findFirst(query);
  }

  findByUserAndGameId(userId: string, gameId: string) {
    return this.playerRepository.findFirst({ where: { userId, gameId } });
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
            players: { include: { user: { select: { nickname: true } } } },
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
            players: { include: { user: { select: { nickname: true } } } },
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
            players: { include: { user: { select: { nickname: true } } } },
          },
        },
      },
    });
  }

  deleteById(playerId: string) {
    return this.playerRepository.deleteById(playerId);
  }

  estimateAssets(player: Partial<PlayerPayload>) {
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

  findPlayerFieldByIndex(fields: FieldsType, indexOfField: number) {
    return fields.find((field) => field.index === indexOfField);
  }

  checkWhetherPlayerHasAllGroup(game: Partial<GamePayload>, index: number) {
    const userFields = fields.filter(
      (field) => field.ownedBy === game.turnOfUserId
    );
    const userFieldsIndexes = userFields.map((field) => field.index);
    if (!userFieldsIndexes.includes(index))
      throw new WsException('You dont have this field');
    const fieldToBuyBranch = this.findPlayerFieldByIndex(fields, index);
    if (fieldToBuyBranch.amountOfBranches >= 5)
      throw new WsException('This field has max amount of branches');
    const groupFields = fields.filter(
      (f) => f.group === fieldToBuyBranch.group
    );
    const userGroupFields = userFields.filter(
      (f) => f.group === fieldToBuyBranch.group
    );
    if (groupFields.length !== userGroupFields.length)
      throw new WsException('You dont have all group fields');
    return fieldToBuyBranch;
  }

  async buyBranch(game: Partial<GamePayload>, fieldToBuyBranch: FieldType) {
    const player = await this.decrementMoneyWithUserAndGameId(
      game.turnOfUserId,
      game.id,
      fieldToBuyBranch.branchPrice
    );
    fieldToBuyBranch.amountOfBranches++;
    return player;
  }

  async pledgeField(game: Partial<GamePayload>, index: number) {
    const fieldToPledge = this.findPlayerFieldByIndex(fields, index);
    const player = await this.incrementMoneyWithUserAndGameId(
      game.turnOfUserId,
      game.id,
      fieldToPledge.branchPrice
    );
    fieldToPledge.isPledged = true;
    fieldToPledge.turnsToUnpledge = game.turnsToUnpledge;
    return player;
  }

  async payRedemptionForField(game: Partial<GamePayload>, index: number) {
    const fieldToPayRedemption = this.findPlayerFieldByIndex(fields, index);
    fieldToPayRedemption.isPledged = false;
    fieldToPayRedemption.turnsToUnpledge = null;
    const player = await this.decrementMoneyWithUserAndGameId(
      game.turnOfUserId,
      game.id,
      fieldToPayRedemption.redemptionPrice
    );
    return player;
  }

  async validateTradeData(game: Partial<GamePayload>, data: OfferTradeDto) {
    if (
      data.offerFieldsIndexes.length === 0 &&
      data.wantedFieldsIndexes.length === 0 &&
      !data.offeredMoney &&
      !data.wantedMoney
    ) {
      throw new WsException('You must offer something');
    }
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
        (field) => field.ownedBy !== data.toUserId
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
}
