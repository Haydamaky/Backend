import { Test } from '@nestjs/testing';
import { PlayerService } from '../player.service';
import { PlayerRepository } from '../player.repository';

describe('PlayerService', () => {
  let service;
  let repository;

  const mockPlayerRepository = {
    create: jest.fn(),
    findFirst: jest.fn(),
    updateById: jest.fn(),
    update: jest.fn(),
    deleteById: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PlayerService,
        { provide: PlayerRepository, useValue: mockPlayerRepository },
      ],
    }).compile();

    service = module.get(PlayerService);
    repository = module.get(PlayerRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('should create a player', async () => {
      const createPlayerDto = {
        color: 'blue',
        userId: 'user-123',
        gameId: 'game-456',
      };
      const expectedResult = { id: 'player-789', ...createPlayerDto };

      mockPlayerRepository.create.mockResolvedValue(expectedResult);

      const result = await service.create(createPlayerDto);
      expect(repository.create).toHaveBeenCalledWith({
        data: createPlayerDto,
        include: {
          game: {
            include: {
              players: { include: { user: { select: { nickname: true } } } },
            },
          },
        },
      });
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findFirst', () => {
    it('should find the first player matching the query', async () => {
      const query = { where: { userId: 'user-123' } };
      const expectedResult = { id: 'player-789', userId: 'user-123' };

      mockPlayerRepository.findFirst.mockResolvedValue(expectedResult);

      const result = await service.findFirst(query);
      expect(repository.findFirst).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findByUserAndGameId', () => {
    it('should find a player by userId and gameId', async () => {
      const userId = 'user-123';
      const gameId = 'game-456';
      const expectedResult = { id: 'player-789', userId, gameId };

      mockPlayerRepository.findFirst.mockResolvedValue(expectedResult);

      const result = await service.findByUserAndGameId(userId, gameId);
      expect(repository.findFirst).toHaveBeenCalledWith({
        where: { userId, gameId },
      });
      expect(result).toEqual(expectedResult);
    });
  });

  describe('updateById', () => {
    it('should update a player by ID', async () => {
      const playerId = 'player-789';
      const fieldsToUpdate = { money: 1000 };
      const expectedResult = { id: playerId, money: 1000 };

      mockPlayerRepository.updateById.mockResolvedValue(expectedResult);

      const result = await service.updateById(playerId, fieldsToUpdate);
      expect(repository.updateById).toHaveBeenCalledWith(playerId, {
        data: fieldsToUpdate,
      });
      expect(result).toEqual(expectedResult);
    });
  });

  describe('decrementMoneyWithUserAndGameId', () => {
    it('should decrement money for a player', async () => {
      const userId = 'user-123';
      const gameId = 'game-456';
      const amount = 100;
      const expectedResult = { id: 'player-789', money: 900 };

      mockPlayerRepository.update.mockResolvedValue(expectedResult);

      const result = await service.decrementMoneyWithUserAndGameId(
        userId,
        gameId,
        amount,
      );
      expect(repository.update).toHaveBeenCalledWith({
        where: { userId_gameId: { userId, gameId } },
        data: { money: { decrement: amount } },
      });
      expect(result).toEqual(expectedResult);
    });
  });

  describe('incrementMoneyWithUserAndGameId', () => {
    it('should increment money for a player', async () => {
      const userId = 'user-123';
      const gameId = 'game-456';
      const amount = 200;
      const expectedResult = { id: 'player-789', money: 1200 };

      mockPlayerRepository.update.mockResolvedValue(expectedResult);

      const result = await service.incrementMoneyWithUserAndGameId(
        userId,
        gameId,
        amount,
      );
      expect(repository.update).toHaveBeenCalledWith({
        where: { userId_gameId: { userId, gameId } },
        data: { money: { increment: amount } },
        include: {
          game: {
            include: {
              players: { include: { user: { select: { nickname: true } } } },
            },
          },
        },
      });
      expect(result).toEqual(expectedResult);
    });
  });

  describe('deleteById', () => {
    it('should delete a player by ID', async () => {
      const playerId = 'player-789';
      const expectedResult = { id: playerId };

      mockPlayerRepository.deleteById.mockResolvedValue(expectedResult);

      const result = await service.deleteById(playerId);
      expect(repository.deleteById).toHaveBeenCalledWith(playerId);
      expect(result).toEqual(expectedResult);
    });
  });
});
