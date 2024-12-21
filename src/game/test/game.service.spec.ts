import {GameService} from "../game.service";
import {GameRepository} from "../game.repository";
import {Test} from "@nestjs/testing";
import {UserModule} from "../../user/user.module";
import {JwtModule} from "@nestjs/jwt";
import {ConfigModule} from "@nestjs/config";
import {PlayerModule} from "../../player/player.module";
import {GameGateway} from "../game.gateway";
import {Auction} from "../types/auction.type";

describe('GameService', () => {
  let gameService: GameService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [UserModule, JwtModule, ConfigModule, PlayerModule],
      providers: [GameGateway, GameService, GameRepository]
    }).compile();

    gameService = module.get<GameService>(GameService);
  });
  describe('GameService.calculateNextIndex', () => {

    it('should calculate the next index correctly within bounds', () => {
      const result = gameService.calculateNextIndex(5, [2, 3], 10);
      expect(result).toBe(10);
    });

    it('should wrap around if the next index exceeds the quantity of elements', () => {
      const result = gameService.calculateNextIndex(8, [2, 3], 10);
      expect(result).toBe(3);
    });

    it('should return the correct index when the sum of dices is zero', () => {
      const result = gameService.calculateNextIndex(5, [0, 0], 10);
      expect(result).toBe(5);
    });

    it('should handle the case where the current index is zero', () => {
      const result = gameService.calculateNextIndex(0, [2, 3], 10);
      expect(result).toBe(5);
    });

    it('should handle the case where the current index is at the last element', () => {
      const result = gameService.calculateNextIndex(10, [1, 1], 10);
      expect(result).toBe(2);
    });

    it('should handle the case where the dice roll is the maximum possible value', () => {
      const result = gameService.calculateNextIndex(5, [6, 6], 10);
      expect(result).toBe(7);
    });

    it('should handle the case where the dice roll is the minimum possible value', () => {
      const result = gameService.calculateNextIndex(5, [1, 1], 10);
      expect(result).toBe(7);
    });

    it('should handle the case where the quantity of elements is one', () => {
      const result = gameService.calculateNextIndex(0, [1, 1], 1);
      expect(result).toBe(1);
    });

    it('should handle the case where the current index and dice roll result in exactly the quantity of elements', () => {
      const result = gameService.calculateNextIndex(5, [2, 3], 10);
      expect(result).toBe(10);
    });
  });

  describe('GameService.setBuyerOnAuction', () => {
    beforeEach(() => {
      gameService.auctions = new Map<string, Auction>();
    });

    it('should set the buyer on auction and update the bid', () => {
      const gameId = 'game1';
      const userId = 'user1';
      const raiseBy = 200;
      const initialAuction: Auction = { fieldIndex: 1, bid: 1000, userId: '' };

      gameService.auctions.set(gameId, initialAuction);

      const result = gameService.setBuyerOnAuction(gameId, userId, raiseBy);

      expect(result.userId).toBe(userId);
      expect(result.bid).toBe(1200);
      expect(gameService.auctions.get(gameId)).toEqual(result);
    });

    it('should throw an error if the auction does not exist', () => {
      const gameId = 'game2';
      const userId = 'user2';
      const raiseBy = 300;

      expect(() => gameService.setBuyerOnAuction(gameId, userId, raiseBy)).toThrow();
    });

    it('should correctly update the auction in the map', () => {
      const gameId = 'game3';
      const userId = 'user3';
      const raiseBy = 150;
      const initialAuction: Auction = { fieldIndex: 2, bid: 500, userId: '' };

      gameService.auctions.set(gameId, initialAuction);

      gameService.setBuyerOnAuction(gameId, userId, raiseBy);

      const updatedAuction = gameService.auctions.get(gameId);
      expect(updatedAuction.userId).toBe(userId);
      expect(updatedAuction.bid).toBe(650);
    });

    it('should call getAuction and setAuction methods', () => {
      const gameId = 'game4';
      const userId = 'user4';
      const raiseBy = 100;
      const initialAuction: Auction = { fieldIndex: 3, bid: 300, userId: '' };

      gameService.getAuction = jest.fn().mockReturnValue(initialAuction);
      gameService.setAuction = jest.fn();

      const result = gameService.setBuyerOnAuction(gameId, userId, raiseBy);

      expect(gameService.getAuction).toHaveBeenCalledWith(gameId);
      expect(gameService.setAuction).toHaveBeenCalledWith(gameId, {
        fieldIndex: 3,
        bid: 400,
        userId: userId,
      });
      expect(result.userId).toBe(userId);
      expect(result.bid).toBe(400);
    });

    it('should handle the case where raiseBy is zero', () => {
      const gameId = 'game5';
      const userId = 'user5';
      const raiseBy = 0;
      const initialAuction: Auction = { fieldIndex: 4, bid: 500, userId: '' };

      gameService.getAuction = jest.fn().mockReturnValue(initialAuction);
      gameService.setAuction = jest.fn();

      const result = gameService.setBuyerOnAuction(gameId, userId, raiseBy);

      expect(gameService.getAuction).toHaveBeenCalledWith(gameId);
      expect(gameService.setAuction).toHaveBeenCalledWith(gameId, {
        fieldIndex: 4,
        bid: 500,
        userId: userId,
      });
      expect(result.userId).toBe(userId);
      expect(result.bid).toBe(500);
    });
  });
})