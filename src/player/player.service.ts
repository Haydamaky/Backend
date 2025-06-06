import { Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Prisma } from '@prisma/client';
import { FieldService } from 'src/field/field.service';
import { GamePayload } from 'src/game/game.repository';
import { FieldDocument } from 'src/schema/Field.schema';
import { CreatePlayerDto } from './dto/create-player.dto';
import { PlayerPayload, PlayerRepository } from './player.repository';

@Injectable()
export class PlayerService {
  constructor(
    private playerRepository: PlayerRepository,
    private fieldService: FieldService
  ) {}

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

  findPlayerWithTurn(game: Partial<GamePayload>) {
    const player = game.players.find(
      (player) => player.userId === game.turnOfUserId
    );
    return player;
  }

  findPlayerWithUserId(game: Partial<GamePayload>, userId: string) {
    const player = game.players.find((player) => player.userId === userId);
    return player;
  }

  async checkWhetherPlayerHasAllGroup(
    game: Partial<GamePayload>,
    index: number,
    userId?: string,
    buying: boolean = true
  ) {
    const fields = await this.fieldService.getGameFields(game.id);
    const playerUserId = userId ? userId : game.turnOfUserId;
    const userFields = fields.filter((field) => field.ownedBy === playerUserId);
    const userFieldsIndexes = userFields.map((field) => field.index);
    if (!userFieldsIndexes.includes(index))
      throw new WsException('You dont have this field');
    const fieldToBuyBranch = this.fieldService.findPlayerFieldByIndex(
      fields,
      index
    );
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

  async pledgeField(
    game: Partial<GamePayload>,
    index: number,
    userId?: string
  ) {
    const fields = await this.fieldService.getGameFields(game.id);
    const playerUserId = userId ? userId : game.turnOfUserId;
    const fieldToPledge = this.fieldService.findPlayerFieldByIndex(
      fields,
      index
    );
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
    await this.fieldService.updateById(fieldToPledge._id, {
      isPledged: true,
      turnsToUnpledge: game.turnsToUnpledge,
    });
    return { player, fields };
  }

  async unmortgageField(
    game: Partial<GamePayload>,
    index: number,
    userId?: string
  ) {
    const playerUserId = userId ? userId : game.turnOfUserId;
    const fields = await this.fieldService.getGameFields(game.id);
    const fieldToUnmortgage = this.fieldService.findPlayerFieldByIndex(
      fields,
      index
    );
    if (!fieldToUnmortgage.isPledged) {
      throw new WsException('Field is not pledged');
    }
    fieldToUnmortgage.isPledged = false;
    fieldToUnmortgage.turnsToUnpledge = null;
    await this.fieldService.updateById(fieldToUnmortgage._id, {
      isPledged: false,
      turnsToUnpledge: null,
    });
    const player = await this.decrementMoneyWithUserAndGameId(
      playerUserId,
      game.id,
      fieldToUnmortgage.redemptionPrice
    );
    return { player, fields };
  }

  async updateLostGame(userId: string, gameId: string) {
    return this.update({
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
  }

  validatePlayerMoney(player: Partial<PlayerPayload>, moneyNeeded: number) {
    if (!player) throw new WsException('No such player');
    if (player.money <= moneyNeeded) throw new WsException('Not enough money');
  }

  choseRandomPlayer(players: Partial<PlayerPayload[]>) {
    const randomIndex = Math.floor(Math.random() * players.length);
    return players[randomIndex];
  }
}
