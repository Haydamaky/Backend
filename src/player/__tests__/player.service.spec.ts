import { Test } from '@nestjs/testing';
import { PlayerService } from '../player.service';
import { PlayerRepository } from '../player.repository';

describe('PlayerService', () => {
  let service: PlayerService;
  let repository: PlayerRepository;

  const mockPlayerRepository = {
    create: jest.fn(),
    findFirst: jest.fn(),
    updateById: jest.fn(),
    update: jest.fn(),
    deleteById: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PlayerService,
        { provide: PlayerRepository, useValue: mockPlayerRepository },
      ],
    }).compile();

    service = module.get<PlayerService>(PlayerService);
    repository = module.get<PlayerRepository>(PlayerRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(repository).toBeDefined();
  });

  describe('Player Creation', () => {
    it('should create a player successfully', async () => {
      const createPlayerDto = {
        color: 'blue',
        userId: 'user-123',
        gameId: 'game-456',
      };
      const expectedResult = {
        id: 'player-789',
        color: 'blue',
        userId: 'user-123',
        gameId: 'game-456',
        game: {
          players: [
            {
              user: {
                nickname: 'playerNickname',
              },
            },
          ],
        },
      };

      mockPlayerRepository.create.mockResolvedValue(expectedResult);

      const result = await service.create(createPlayerDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            color: createPlayerDto.color,
            userId: createPlayerDto.userId,
            gameId: createPlayerDto.gameId,
          }),
          include: expect.objectContaining({
            game: expect.objectContaining({
              include: expect.objectContaining({
                players: expect.objectContaining({
                  include: expect.objectContaining({
                    user: expect.objectContaining({
                      select: expect.objectContaining({ nickname: true }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        })
      );
      expect(result).toEqual(expectedResult);
    });

    it('should throw an error when player creation fails', async () => {
      const createPlayerDto = {
        color: 'blue',
        userId: 'user-123',
        gameId: 'game-456',
      };
      const error = new Error('Player creation failed');
      mockPlayerRepository.create.mockRejectedValue(error);

      await expect(service.create(createPlayerDto)).rejects.toThrow(error);
    });

    it('should handle empty userId gracefully', async () => {
      const createPlayerDto = { color: 'blue', userId: '', gameId: 'game-456' };
      await expect(service.create(createPlayerDto)).rejects.toThrow();
    });

    it('should throw an error when userId is not unique', async () => {
      const createPlayerDto = { color: 'blue', userId: 'user-123', gameId: 'game-456' };
      mockPlayerRepository.create.mockRejectedValue(new Error('Duplicate userId'));
      await expect(service.create(createPlayerDto)).rejects.toThrow('Duplicate userId');
    });
  });

  describe('Find Player', () => {
    it('should find the first player matching the query', async () => {
      const query = { where: { userId: 'user-123' } };
      const expectedResult = { id: 'player-789', userId: 'user-123' };

      mockPlayerRepository.findFirst.mockResolvedValue(expectedResult);

      const result = await service.findFirst(query);

      expectPlayerRepositoryCall('findFirst', query);
      expect(result).toEqual(expectedResult);
    });

    it('should return null if no player is found', async () => {
      const query = { where: { userId: 'user-999' } };
      mockPlayerRepository.findFirst.mockResolvedValue(null);

      const result = await service.findFirst(query);

      expectPlayerRepositoryCall('findFirst', query);
      expect(result).toBeNull();
    });
  });

  describe('Find Player by User and Game Id', () => {
    it('should find a player by userId and gameId', async () => {
      const userId = 'user-123';
      const gameId = 'game-456';
      const expectedResult = { id: 'player-789', userId, gameId };

      mockPlayerRepository.findFirst.mockResolvedValue(expectedResult);

      const result = await service.findByUserAndGameId(userId, gameId);

      expectPlayerRepositoryCall('findFirst', { where: { userId, gameId } });
      expect(result).toEqual(expectedResult);
    });

    it('should return null if no player is found by userId and gameId', async () => {
      const userId = 'user-123';
      const gameId = 'game-456';

      mockPlayerRepository.findFirst.mockResolvedValue(null);

      const result = await service.findByUserAndGameId(userId, gameId);

      expectPlayerRepositoryCall('findFirst', { where: { userId, gameId } });
      expect(result).toBeNull();
    });
  });

  describe('Update Player', () => {
    it('should update a player by ID', async () => {
      const playerId = 'player-789';
      const fieldsToUpdate = { money: 1000 };
      const expectedResult = { id: playerId, money: 1000 };

      mockPlayerRepository.updateById.mockResolvedValue(expectedResult);

      const result = await service.updateById(playerId, fieldsToUpdate);

      expectPlayerRepositoryCall('updateById', playerId, { data: fieldsToUpdate });
      expect(result).toEqual(expectedResult);
    });

    it('should throw an error when update fails', async () => {
      const playerId = 'player-789';
      const fieldsToUpdate = { money: 1000 };
      const error = new Error('Update failed');
      mockPlayerRepository.updateById.mockRejectedValue(error);

      await expect(service.updateById(playerId, fieldsToUpdate)).rejects.toThrow(error);
    });

    it('should update only color of the player', async () => {
      const playerId = 'player-789';
      const fieldsToUpdate = { color: 'red' };
      const expectedResult = { id: playerId, color: 'red', money: 1000 };

      mockPlayerRepository.updateById.mockResolvedValue(expectedResult);

      const result = await service.updateById(playerId, fieldsToUpdate);

      expect(repository.updateById).toHaveBeenCalledWith(playerId, { data: fieldsToUpdate });
      expect(result).toEqual(expectedResult);
    });
  });

  describe('Money Operations', () => {
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

      expectMoneyUpdateCall(userId, gameId, amount, 'decrement');
      expect(result).toEqual(expectedResult);
    });

    it('should throw an error when money update fails', async () => {
      const userId = 'user-123';
      const gameId = 'game-456';
      const amount = 100;
      const error = new Error('Money update failed');
      mockPlayerRepository.update.mockRejectedValue(error);

      await expect(
        service.decrementMoneyWithUserAndGameId(userId, gameId, amount)
      ).rejects.toThrow(error);
    });
  });

  describe('Delete Player', () => {
    it('should delete a player by ID', async () => {
      const playerId = 'player-789';
      const expectedResult = { id: playerId };

      mockPlayerRepository.deleteById.mockResolvedValue(expectedResult);

      const result = await service.deleteById(playerId);

      expectPlayerRepositoryCall('deleteById', playerId);
      expect(result).toEqual(expectedResult);
    });

    it('should throw an error when deleting a player fails', async () => {
      const playerId = 'player-789';
      const error = new Error('Delete failed');
      mockPlayerRepository.deleteById.mockRejectedValue(error);

      await expect(service.deleteById(playerId)).rejects.toThrow(error);
    });
  });

  function expectPlayerRepositoryCall(method, ...args) {
    expect(repository[method]).toHaveBeenCalledWith(...args);
  }

  function expectMoneyUpdateCall(userId, gameId, amount, operation) {
    expect(repository.update).toHaveBeenCalledWith({
      where: { userId_gameId: { userId, gameId } },
      data: { money: { [operation]: amount } },
    });
  }
});
