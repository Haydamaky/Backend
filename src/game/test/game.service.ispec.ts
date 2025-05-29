import { GameRepository } from '../game.repository';
import { GameService } from '../game.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UserModule } from '../../user/user.module';
import { PlayerModule } from '../../player/player.module';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { GameGateway } from '../game.gateway';
import { WsException } from '@nestjs/websockets';
import { fields } from '../../utils/fields';

describe('GameService', () => {
  let gameService: GameService;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [UserModule, JwtModule, ConfigModule, PlayerModule],
      providers: [GameGateway, GameService, GameRepository],
    }).compile();

    gameService = module.get<GameService>(GameService);
    prismaService = module.get<PrismaService>(PrismaService);

    await prismaService.game.create({
      data: {
        turnEnds: '1000',
        status: 'LOBBY',
        playersCapacity: 2,
      },
    });
  });

  it('should allow a player to join a game and start the game if capacity is reached', async () => {
    const game = await prismaService.game.findFirst({});

    const user1 = await prismaService.user.create({
      data: {
        nickname: 'User1',
        email: 'user1@example.com',
        hash: 'hashedPassword1',
      },
    });
    const user2 = await prismaService.user.create({
      data: {
        nickname: 'User2',
        email: 'user2@example.com',
        hash: 'hashedPassword2',
      },
    });

    await gameService.onJoinGame(game.id, user1.id);
    const result = await gameService.onJoinGame(game.id, user2.id);

    expect(result.shouldStart).toBe(true);
    expect(result.game.status).toBe('ACTIVE');
  });

  it('should throw an error if the auction was not started', async () => {
    const game = await prismaService.game.findFirst({});
    const user = await prismaService.user.findFirst({
      where: {
        email: 'user1@example.com',
      },
    });

    await expect(gameService.raisePrice(game.id, user.id, 200)).rejects.toThrow(
      new WsException('Auction wasn’t started')
    );
  });

  it('should throw an error if the auction was not started', async () => {
    const game = await prismaService.game.findFirst({});
    const user = await prismaService.user.findFirst({
      where: {
        email: 'user1@example.com',
      },
    });

    await expect(gameService.raisePrice(game.id, user.id, 200)).rejects.toThrow(
      new WsException('Auction wasn’t started')
    );
  });

  it('should handle auction logic correctly', async () => {
    const game = await prismaService.game.findFirst({});
    const user = await prismaService.user.findFirst({
      where: {
        email: 'user1@example.com',
      },
    });

    await prismaService.player.updateMany({
      where: {
        gameId: game.id,
      },
      data: {
        currentFieldIndex: 2,
        money: 1000,
      },
    });

    await gameService.putUpForAuction(game);

    const auction = gameService.getAuction(game.id);
    expect(auction).toBeDefined();
    const bidValueBefore = auction.bid;

    const raisedAuction = await gameService.raisePrice(game.id, user.id, 200);
    expect(raisedAuction.auctionUpdated.bid).toEqual(bidValueBefore + 200);
  });

  it('should not allow to raise price if user does not have enough money', async () => {
    const game = await prismaService.game.findFirst({});
    const user = await prismaService.user.findFirst({
      where: {
        email: 'user1@example.com',
      },
    });

    await prismaService.player.updateMany({
      where: {
        gameId: game.id,
      },
      data: {
        currentFieldIndex: 2,
      },
    });

    await prismaService.player.update({
      where: {
        userId_gameId: {
          userId: user.id,
          gameId: game.id,
        },
      },
      data: {
        money: 0,
      },
    });

    await gameService.putUpForAuction(game);
    const auction = gameService.getAuction(game.id);
    expect(auction).toBeDefined();
    await expect(gameService.raisePrice(game.id, user.id, 200)).rejects.toThrow(
      new WsException('Not enough money')
    );
  });

  it('should throw an error if the raise amount is less than 100', async () => {
    const game = await prismaService.game.findFirst({});
    const user = await prismaService.user.findFirst({
      where: {
        email: 'user1@example.com',
      },
    });

    await prismaService.player.updateMany({
      where: {
        gameId: game.id,
      },
      data: {
        currentFieldIndex: 2,
      },
    });

    await gameService.putUpForAuction(game);

    await expect(gameService.raisePrice(game.id, user.id, 50)).rejects.toThrow(
      new WsException('Raise is not big enough')
    );
  });

  it('should throw an error if the user does not have enough money to raise the price', async () => {
    const game = await prismaService.game.findFirst({});
    const user = await prismaService.user.findFirst({
      where: {
        email: 'user1@example.com',
      },
    });

    await prismaService.player.updateMany({
      where: {
        gameId: game.id,
      },
      data: {
        currentFieldIndex: 2,
      },
    });

    await prismaService.player.update({
      where: {
        userId_gameId: {
          userId: user.id,
          gameId: game.id,
        },
      },
      data: {
        money: 50,
      },
    });

    await gameService.putUpForAuction(game);

    await expect(gameService.raisePrice(game.id, user.id, 200)).rejects.toThrow(
      new WsException('Not enough money')
    );
  });

  it('should handle multiple players raising the price', async () => {
    const game = await prismaService.game.findFirst({});
    await prismaService.player.updateMany({
      where: {
        gameId: game.id,
      },
      data: {
        currentFieldIndex: 2,
      },
    });
    const user1 = await prismaService.user.findFirst({
      where: {
        email: 'user1@example.com',
      },
    });
    const user2 = await prismaService.user.findFirst({
      where: {
        email: 'user2@example.com',
      },
    });

    await prismaService.player.update({
      where: {
        userId_gameId: {
          userId: user1.id,
          gameId: game.id,
        },
      },
      data: {
        money: 5000,
      },
    });

    await prismaService.player.update({
      where: {
        userId_gameId: {
          userId: user2.id,
          gameId: game.id,
        },
      },
      data: {
        money: 5000,
      },
    });

    await gameService.putUpForAuction(game);

    const auction = gameService.getAuction(game.id);
    expect(auction).toBeDefined();
    const bidValueBefore = auction.bid;

    await gameService.raisePrice(game.id, user1.id, 200);
    const raisedAuction = await gameService.raisePrice(game.id, user2.id, 300);
    expect(raisedAuction.auctionUpdated.bid).toEqual(bidValueBefore + 500);
    expect(raisedAuction.auctionUpdated.userId).toEqual(user2.id);
  });

  it('should reset the auction timer after a price raise', async () => {
    const game = await prismaService.game.findFirst({});
    const user = await prismaService.user.findFirst({
      where: {
        email: 'user1@example.com',
      },
    });

    await prismaService.player.update({
      where: {
        userId_gameId: {
          userId: user.id,
          gameId: game.id,
        },
      },
      data: {
        money: 1000,
      },
    });

    await gameService.putUpForAuction(game);

    const auction = gameService.getAuction(game.id);
    expect(auction).toBeDefined();
    const bidValueBefore = auction.bid;

    const raisedAuction = await gameService.raisePrice(game.id, user.id, 200);
    expect(raisedAuction.auctionUpdated.bid).toEqual(bidValueBefore + 200);
    expect(Number(raisedAuction.turnEnds)).toBeGreaterThan(Date.now());
  });

  describe('buyField tests', () => {
    it('should allow a player to buy a field if they have enough money', async () => {
      const game = await prismaService.game.findFirst({
        include: { players: true },
      });

      await prismaService.player.updateMany({
        where: { gameId: game.id },
        data: { money: 5000, currentFieldIndex: 2 },
      });

      await expect(gameService.buyField(game as any)).rejects.toThrow(
        new WsException('You cant buy this field')
      );
    });

    it('should not allow a player to buy a field if they do not have enough money', async () => {
      const game = await prismaService.game.findFirst({
        include: { players: true },
      });

      const player = game.players[0];
      await prismaService.player.updateMany({
        where: { gameId: game.id },
        data: { money: 5000, currentFieldIndex: 2 },
      });

      await expect(gameService.buyField(game as any)).rejects.toThrow(
        new WsException('You cant buy this field')
      );
    });

    it('should not allow a player to buy a field that is not available for purchase', async () => {
      const game = await prismaService.game.findFirst({
        include: { players: true },
      });

      const player = game.players[0];
      await prismaService.player.updateMany({
        where: { gameId: game.id },
        data: { money: 5000, currentFieldIndex: 2 },
      });

      const field = gameService.findPlayerFieldByIndex(
        fields,
        player.currentFieldIndex
      );
      field.price = null;

      await expect(gameService.buyField(game as any)).rejects.toThrow(
        new WsException('You cant buy this field')
      );
    });

    it('should not allow a player to buy a field if an auction is active', async () => {
      const game = await prismaService.game.findFirst({
        include: { players: true },
      });

      const player = game.players[0];
      await prismaService.player.updateMany({
        where: { gameId: game.id },
        data: { money: 5000, currentFieldIndex: 2 },
      });

      gameService.setAuction(game.id, {
        fieldIndex: player.currentFieldIndex,
        bid: 1000,
        userId: '',
      });

      await expect(gameService.buyField(game as any)).rejects.toThrow(
        new WsException('You cant buy this field')
      );
    });
  });

  describe('makeTurn tests', () => {
    it('should successfully make a turn and update the game state', async () => {
      const game = await prismaService.game.findFirst({
        include: { players: true },
      });

      await prismaService.player.updateMany({
        where: { gameId: game.id },
        data: { money: 5000, currentFieldIndex: 2 },
      });

      const result = await gameService.makeTurn(game as any);

      expect(result.updatedGame.dices).toBeDefined();
      expect(result.nextIndex).toBeGreaterThanOrEqual(0);
      expect(result.updatedGame.turnEnds).toBeDefined();
    });

    it("should update the player's field index based on the dice roll", async () => {
      const game = await prismaService.game.findFirst({
        include: { players: true },
      });

      await prismaService.player.updateMany({
        where: { gameId: game.id },
        data: { money: 5000, currentFieldIndex: 2 },
      });

      const currentPlayer = game.players[0];
      await prismaService.game.update({
        where: { id: game.id },
        data: { turnOfUserId: currentPlayer.userId },
      });

      const result = await gameService.makeTurn(game as any);
      expect(result.playerNextField.index).toBe(result.nextIndex);
    });

    it('should wrap around the board correctly', async () => {
      const game = await prismaService.game.findFirst({
        include: { players: true },
      });

      await prismaService.player.updateMany({
        where: { gameId: game.id },
        data: { money: 5000, currentFieldIndex: 18 },
      });

      const currentPlayer = game.players[0];
      await prismaService.game.update({
        where: { id: game.id },
        data: { turnOfUserId: currentPlayer.userId },
      });

      const result = await gameService.makeTurn(game as any);
      expect(result.nextIndex).toBeLessThan(
        gameService.PLAYING_FIELDS_QUANTITY
      );
    });

    it('should update the game state correctly after a turn', async () => {
      const game = await prismaService.game.findFirst({
        include: { players: true },
      });

      await prismaService.player.updateMany({
        where: { gameId: game.id },
        data: { money: 5000, currentFieldIndex: 2 },
      });
      const currentPlayer = game.players[0];
      await prismaService.game.update({
        where: { id: game.id },
        data: { turnOfUserId: currentPlayer.userId },
      });

      const result = await gameService.makeTurn(game as any);
      expect(result.updatedGame.turnEnds).toBeDefined();
      expect(result.updatedGame.dices).toBeDefined();
    });
  });

  describe('GameService - passTurnToNext', () => {
    it('should pass the turn to the next player and reset the auction state', async () => {
      const user1 = await prismaService.user.create({
        data: {
          id: 'user3-id',
          nickname: 'User3',
          email: 'user3@example.com',
          hash: 'hashedPassword1',
        },
      });
      const user2 = await prismaService.user.create({
        data: {
          id: 'user4-id',
          nickname: 'User4',
          email: 'user4@example.com',
          hash: 'hashedPassword2',
        },
      });

      const game = await prismaService.game.create({
        data: {
          playersCapacity: 2,
          status: 'ACTIVE',
          turnOfUserId: 'user1-id',
          timeOfTurn: 120,
          turnEnds: '1000',
          players: {
            create: [
              { userId: user1.id, color: 'red' },
              { userId: user2.id, color: 'blue' },
            ],
          },
        },
        include: { players: true },
      });

      gameService.setAuction(game.id, {
        fieldIndex: 1,
        bid: 100,
        userId: 'user1-id',
      });

      const result = await gameService.passTurnToNext(game as any);

      expect(result.updatedGame.turnOfUserId).toBe('user3-id');

      const auction = gameService.getAuction(game.id);
      expect(auction).toBeNull();
    });
  });

  describe('GameService - payForField', () => {
    it('should handle the payment process correctly when a player lands on a field owned by another player', async () => {
      const game = await prismaService.game.findFirst({
        include: { players: true },
      });

      const player1 = game.players[0];
      const player2 = game.players[1];

      await prismaService.player.update({
        where: { id: player1.id },
        data: { money: 5000, currentFieldIndex: 2 },
      });

      const field = {
        index: 2,
        ownedBy: player2.userId,
        incomeWithoutBranches: 200,
      };

      const result = await gameService.payForField(game as any, field as any);

      const updatedPlayer1 = await prismaService.player.findUnique({
        where: { id: player1.id },
      });
      const updatedPlayer2 = await prismaService.player.findUnique({
        where: { id: player2.id },
      });

      expect(updatedPlayer1.money).toBe(4800); // 5000 - 200
      expect(updatedPlayer2.money).toBe(5200); // 5000 + 200
    });

    it('should throw an error if the player does not have enough money to pay for the field', async () => {
      const game = await prismaService.game.findFirst({
        include: { players: true },
      });

      const player1 = game.players[0];
      const player2 = game.players[1];

      await prismaService.game.update({
        where: { id: game.id },
        data: { turnOfUserId: player1.userId },
      });

      await prismaService.player.update({
        where: { id: player1.id },
        data: { money: 100, currentFieldIndex: 2 },
      });

      const updatedGame = await prismaService.game.findFirst({
        where: { id: game.id },
        include: { players: true },
      });

      const field = {
        index: 2,
        ownedBy: player2.userId,
        incomeWithoutBranches: 200,
      };

      await expect(
        gameService.payForField(updatedGame as any, field as any)
      ).rejects.toThrow(WsException);
    });
  });
});
