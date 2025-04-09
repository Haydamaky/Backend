import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { WsException } from '@nestjs/websockets';
import { ChatType, Player, Prisma } from '@prisma/client';
import { Model } from 'mongoose';
import { AuctionService } from 'src/auction/auction.service';
import { EventService } from 'src/event/event.service';
import { PlayerService } from 'src/player/player.service';
import { Field, FieldDocument } from 'src/schema/Field.schema';
import { TimerService } from 'src/timer/timers.service';
import { DEFAULT_FIELDS } from 'src/utils/fields';
import secretFields from 'src/utils/fields/secretFields';
import { GamePayload, GameRepository } from './game.repository';
import { SecretService } from 'src/secret/secret.service';
@Injectable()
export class GameService {
  constructor(
    private gameRepository: GameRepository,
    @Inject(forwardRef(() => PlayerService))
    private playerService: PlayerService,
    private eventService: EventService,
    @Inject(forwardRef(() => AuctionService))
    private auctionService: AuctionService,
    @InjectModel(Field.name)
    private fieldModel: Model<Field>,
    private timerService: TimerService,
    private secretService: SecretService
  ) {
    this.passTurnToUser = this.passTurnToUser.bind(this);
  }

  readonly PLAYING_FIELDS_QUANTITY = 40;

  async getVisibleGames() {
    return this.gameRepository.findMany({
      where: { status: 'LOBBY' },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  async createGame(userId: string) {
    const activePlayer = await this.gameRepository.findFirst({
      where: {
        OR: [{ status: 'LOBBY' }, { status: 'ACTIVE' }],
        players: {
          some: {
            userId,
          },
        },
      },
    });

    if (activePlayer) return null;
    const newGame = await this.gameRepository.create({
      data: {
        playersCapacity: 4, // TODO change players capacity to dynamic number
        players: {
          create: {
            userId,
            color: this.playerService.COLORS[0],
          },
        },
        turnEnds: '10000',
      },
      include: {
        players: {
          include: {
            user: {
              select: {
                nickname: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
    const gameFields = DEFAULT_FIELDS.map((field) => ({
      ...field,
      gameId: newGame.id,
    }));

    await this.fieldModel.insertMany(gameFields);
    return newGame;
  }

  async getGameFields(gameId: string) {
    return await this.fieldModel.find({ gameId });
  }

  async getGame(gameId: string) {
    return this.gameRepository.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: { user: { select: { nickname: true, id: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  async onJoinGame(gameId: string, userId: string) {
    const game = await this.gameRepository.findFirst({
      where: { id: gameId },
      include: {
        players: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
    const alreadyJoined = game.players.some(
      (player) => player.userId === userId
    );
    if (alreadyJoined || game.status !== 'LOBBY')
      return { game: null, shouldStart: false };
    const color = this.playerService.COLORS[game.players.length];
    const player = await this.playerService.create({
      color,
      userId,
      gameId,
    });
    const { game: gameWithCreatedPlayer } = player;
    if (
      gameWithCreatedPlayer.playersCapacity ===
      gameWithCreatedPlayer.players.length
    ) {
      const turnEnds = this.timerService.calculateFutureTime(game.timeOfTurn);
      const startedGame = await this.gameRepository.updateById(gameId, {
        data: {
          status: 'ACTIVE',
          turnOfUserId:
            gameWithCreatedPlayer.players[
              gameWithCreatedPlayer.players.length - 1
            ].userId,
          turnEnds,
          chat: {
            create: {
              type: ChatType.GAME,
              participants: {
                createMany: {
                  data: [
                    ...gameWithCreatedPlayer.players.map((player) => ({
                      userId: player.userId,
                    })),
                  ],
                },
              },
            },
          },
        },
        include: {
          players: {
            include: { user: { select: { nickname: true, id: true } } },
            orderBy: {
              createdAt: 'asc',
            },
          },
          chat: {
            select: {
              id: true,
            },
          },
        },
      });
      return { game: startedGame, shouldStart: true };
    }
    return { game: gameWithCreatedPlayer, shouldStart: false };
  }

  async onLeaveGame(gameId: string, userId: string) {
    const player = await this.playerService.findFirst({
      where: { userId, gameId },
    });
    if (!player) return null;

    await this.playerService.deleteById(player.id);

    const game = await this.getGame(gameId);
    return game;
  }

  async findGameWithPlayers(gameId: string) {
    const game = await this.gameRepository.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
    return game;
  }

  findById(gameId: string) {
    return this.gameRepository.findById(gameId);
  }

  onRollDice() {
    const firstDice = Math.ceil(Math.random() * 6);
    const secondDice = Math.ceil(Math.random() * 6);
    return `${firstDice}:${secondDice}`;
  }

  async findCurrentFieldFromGame(game: Partial<GamePayload>) {
    const player = await this.playerService.findByUserAndGameId(
      game.turnOfUserId,
      game.id
    );
    const fields = await this.getGameFields(game.id);
    return this.findPlayerFieldByIndex(fields, player.currentFieldIndex);
  }

  async updateGameWithNewTurn(
    game: Partial<GamePayload>,
    timeOfTurn: number | null = null
  ) {
    const turnEnds = this.timerService.calculateFutureTime(
      timeOfTurn ? timeOfTurn : game.timeOfTurn
    );
    return this.updateById(game.id, {
      turnEnds,
    });
  }

  findNextTurnUser(game: Partial<GamePayload>) {
    const index = game.players.findIndex(
      (player) => player.userId === game.turnOfUserId
    );
    let nextIndex = index + 1;
    if (nextIndex === game.players.length) {
      nextIndex = 0;
    }
    const turnOfNextUserId = game.players[nextIndex].userId;
    return { turnOfNextUserId };
  }

  async updateById(
    gameId: string,
    fieldsToUpdate: Partial<Prisma.$GamePayload['scalars']>
  ) {
    return this.gameRepository.updateById(gameId, {
      data: fieldsToUpdate,
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  parseDicesToArr(dices: string) {
    const dicesStringsArr = dices.split(':');
    return dicesStringsArr.map(Number);
  }

  calculateNextIndex(
    currentIndex: number,
    dicesArr: number[],
    quantityOfElements: number
  ) {
    const potentialNextIndex = currentIndex + dicesArr[0] + dicesArr[1];
    const resObj =
      potentialNextIndex > quantityOfElements
        ? {
            nextIndex: potentialNextIndex - quantityOfElements,
            shouldGetMoney: true,
          }
        : { nextIndex: potentialNextIndex, shouldGetMoney: false };
    return resObj;
  }

  findPlayerFieldByIndex(fields: FieldDocument[], indexOfField: number) {
    return fields.find((field) => field.index === indexOfField);
  }

  async decrementPledgedFields(fields: FieldDocument[]) {
    fields.forEach((field) => {
      if (field.isPledged && field.turnsToUnpledge === 0) {
        field.isPledged = false;
        field.ownedBy = '';
      } else if (field.isPledged) {
        field.turnsToUnpledge--;
      }
    });
    await this.updateFields(fields, [
      'isPledged',
      'ownedBy',
      'turnsToUnpledge',
    ]);
  }

  async updateFields<T extends FieldDocument>(
    fields: T[],
    propertiesToUpdate: string[]
  ): Promise<void> {
    const updates = fields.map((field) => {
      const updateFields: any = {};

      for (const property of propertiesToUpdate) {
        if (field[property] !== undefined) {
          updateFields[property] = field[property];
        }
      }

      return {
        updateOne: {
          filter: { _id: field._id },
          update: { $set: updateFields },
        },
      };
    });
    await this.fieldModel.bulkWrite(updates);
  }

  async makeTurn(game: Partial<GamePayload>) {
    const dices = this.onRollDice();

    const currentPlayer = this.playerService.findPlayerWithTurn(game);
    const dicesArr = this.parseDicesToArr(dices);
    const fields = await this.getGameFields(game.id);
    const { nextIndex, shouldGetMoney } = this.calculateNextIndex(
      currentPlayer.currentFieldIndex,
      dicesArr,
      this.PLAYING_FIELDS_QUANTITY
    );
    this.decrementPledgedFields(fields);
    await this.playerService.updateById(currentPlayer.id, {
      currentFieldIndex: nextIndex,
      money: { increment: shouldGetMoney ? game.passStartBonus : 0 },
    });

    const playerNextField = this.findPlayerFieldByIndex(fields, nextIndex);
    let updatedGame: null | Partial<GamePayload> = null;
    if (playerNextField.ownedBy !== currentPlayer.userId) {
      const turnEnds = this.timerService.calculateFutureTime(game.timeOfTurn);
      updatedGame = await this.updateById(game.id, {
        dices,
        turnEnds,
      });
    } else {
      updatedGame = await this.updateById(game.id, {
        dices,
      });
    }
    return {
      updatedGame,
      fields,
      nextIndex,
      playerNextField,
      hasOwner: playerNextField?.ownedBy,
      currentPlayer,
    };
  }

  getRandomSecret() {
    const randomSecretIndex = Math.floor(Math.random() * secretFields.length);
    return secretFields[randomSecretIndex];
  }

  getRandomPlayersUserId(players: Partial<Player[]>) {
    const randomIndex = Math.floor(Math.random() * players.length);
    return players[randomIndex].userId;
  }

  async findCurrentFieldWithUserId(game: Partial<GamePayload>) {
    const player = this.playerService.findPlayerWithTurn(game);
    const fields = await this.getGameFields(game.id);
    return this.findPlayerFieldByIndex(fields, player.currentFieldIndex);
  }

  async buyField(game: Partial<GamePayload>) {
    const player = this.playerService.findPlayerWithTurn(game);
    const fields = await this.getGameFields(game.id);
    const field = this.findPlayerFieldByIndex(fields, player.currentFieldIndex);
    if (field.ownedBy) {
      throw new WsException('Field is already owned');
    }
    if (
      !field.price ||
      field.price > player.money ||
      field.ownedBy === player.userId ||
      this.auctionService.getAuction(game.id)
    ) {
      throw new WsException('You cant buy this field');
    }
    this.timerService.clear(game.id);
    field.ownedBy = game.turnOfUserId;
    await this.updateFields(fields, ['ownedBy']);
    const updatedPlayer =
      await this.playerService.decrementMoneyWithUserAndGameId(
        game.turnOfUserId,
        game.id,
        field.price
      );
    return { updatedPlayer, field };
  }

  findPlayersWhoDidntLose(game: Partial<GamePayload>) {
    return game.players.filter((player) => !player.lost);
  }

  async passTurnToNext(game: Partial<GamePayload>) {
    if (!game.dices) {
      throw new WsException('You have to roll dices first');
    }
    const dices = '';
    this.auctionService.setAuction(game.id, null);
    this.timerService.clear(game.id);
    let { turnOfNextUserId } = this.findNextTurnUser(game);
    game.turnOfUserId = turnOfNextUserId;
    let playersNotLost = game.players.length;
    while (playersNotLost !== 1) {
      if (this.playerService.findPlayerWithTurn(game).lost) {
        turnOfNextUserId = this.findNextTurnUser(game).turnOfNextUserId;
        game.turnOfUserId = turnOfNextUserId;
      } else {
        break;
      }
      --playersNotLost;
    }
    const turnEnds = this.timerService.calculateFutureTime(game.timeOfTurn);
    const updatedGame = await this.updateById(game.id, {
      turnOfUserId: turnOfNextUserId,
      dices,
      turnEnds,
    });
    return { updatedGame, turnEnds, turnOfNextUserId, dices };
  }

  async payForField(
    game: Partial<GamePayload>,
    playerNextField: FieldDocument
  ) {
    const currentPlayer = this.playerService.findPlayerWithTurn(game);

    if (
      currentPlayer.money <
      playerNextField.income[playerNextField.amountOfBranches]
    ) {
      const fields = await this.getGameFields(game.id);
      // We can add pledging of last owned field or smt to not make player lose immidiately
      const { updatedPlayer } = await this.playerService.loseGame(
        currentPlayer.userId,
        game.id,
        fields
      );

      return { updatedGame: updatedPlayer.game, fields };
    }

    await this.playerService.decrementMoneyWithUserAndGameId(
      game.turnOfUserId,
      game.id,
      playerNextField.income[playerNextField.amountOfBranches]
    );
    const received = await this.playerService.incrementMoneyWithUserAndGameId(
      playerNextField.ownedBy,
      game.id,
      playerNextField.income[playerNextField.amountOfBranches]
    );
    return { updatedGame: received.game };
  }

  async payToBank(game: Partial<GamePayload>, userId: string, amount: number) {
    const secretInfo = this.secretService.secrets.get(game.id);
    if (!secretInfo) this.timerService.clear(game.id);
    const currentPlayer = game.players.find(
      (player) => player.userId === userId
    );
    const fields = await this.getGameFields(game.id);
    if (currentPlayer.money < amount) {
      // We can add pledging of last owned field or smt to not make player lose immidiately
      const { updatedPlayer, updatedFields } =
        await this.playerService.loseGame(
          currentPlayer.userId,
          game.id,
          fields
        );
      return { updatedGame: updatedPlayer.game, fields: updatedFields };
    }
    const playerWhoPayed =
      await this.playerService.incrementMoneyWithUserAndGameId(
        currentPlayer.userId || game.turnOfUserId,
        game.id,
        amount
      );
    if (secretInfo && secretInfo.users.includes(userId)) {
      const userIndex = secretInfo.users.findIndex(
        (userId) => userId === playerWhoPayed.userId
      );
      secretInfo.users[userIndex] = '';
    }
    if (
      secretInfo &&
      secretInfo.users.every((userId, index) => {
        if (secretInfo.users.length === 2 && userId !== '') {
          return secretInfo.amounts[index] > 0;
        }
        if (secretInfo.users.length > 2 && index === 0) {
          return true;
        }
        return userId === '';
      })
    ) {
      this.secretService.secrets.delete(game.id);
      return {
        updatedGame: playerWhoPayed.game,
        fields,
        playerWhoPayed,
      };
    }
    return {
      updatedGame: playerWhoPayed.game,
      fields,
      playerWhoPayed,
    };
  }

  decreaseHouses(gameId: string, quantity: number) {
    return this.gameRepository.updateById(gameId, {
      data: { housesQty: { decrement: quantity } },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  increaseHouses(gameId: string, quantity: number) {
    return this.gameRepository.updateById(gameId, {
      data: { housesQty: { increment: quantity } },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  decreaseHotels(gameId: string, quantity: number) {
    return this.gameRepository.updateById(gameId, {
      data: { hotelsQty: { decrement: quantity } },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  increaseHotels(gameId: string, quantity: number) {
    return this.gameRepository.updateById(gameId, {
      data: { hotelsQty: { increment: quantity } },
      include: {
        players: {
          include: { user: { select: { nickname: true } } },
          orderBy: {
            createdAt: 'asc',
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  hasWinner(game: Partial<GamePayload>) {
    const notLosers = this.findPlayersWhoDidntLose(game);
    return notLosers.length === 1;
  }

  async passTurnToUser(data: {
    game: Partial<GamePayload>;
    toUserId: string;
    turnTime?: number;
  }) {
    this.timerService.clear(data.game.id);
    const turnEnds = this.timerService.calculateFutureTime(
      data.turnTime || 10000
    );
    const updatedGame = await this.updateById(data.game.id, {
      turnOfUserId: data.toUserId,
      turnEnds,
    });
    if (!data.game.dices) {
      this.eventService.emitGameEvent('setRollDiceTimer', updatedGame);
    } else {
      this.eventService.emitGameEvent('setAfterRolledDiceTimer', updatedGame);
    }

    return { updatedGame };
  }
}
