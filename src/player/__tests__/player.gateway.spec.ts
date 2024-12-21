import { Test, TestingModule } from '@nestjs/testing';
import { PlayerGateway } from '../player.gateway';
import { PlayerService } from '../player.service';
import { CreatePlayerDto } from '../dto/create-player.dto';

describe('PlayerGateway', () => {
  let gateway: PlayerGateway;
  let playerService: jest.Mocked<PlayerService>;

  const mockPlayerService: Partial<Record<keyof PlayerService, jest.Mock>> = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerGateway,
        { provide: PlayerService, useValue: mockPlayerService },
      ],
    }).compile();

    gateway = module.get<PlayerGateway>(PlayerGateway);
    playerService = module.get<PlayerService>(PlayerService) as jest.Mocked<PlayerService>;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('create', () => {
    it('should call playerService.create with correct data', async () => {
      const createPlayerDto: CreatePlayerDto = {
        color: 'blue',
        userId: 'user-123',
        gameId: 'game-456',
      };
      const expectedResult = { id: 'player-789', ...createPlayerDto };

      mockPlayerService.create!.mockResolvedValue(expectedResult);

      const result = await gateway.create(createPlayerDto);

      expect(mockPlayerService.create).toHaveBeenCalledWith(createPlayerDto);
      expect(result).toEqual(expectedResult);
    });

    it('should handle errors gracefully', async () => {
      const createPlayerDto: CreatePlayerDto = {
        color: 'blue',
        userId: 'user-123',
        gameId: 'game-456',
      };

      mockPlayerService.create!.mockRejectedValue(new Error('Test Error'));

      await expect(gateway.create(createPlayerDto)).rejects.toThrow('Test Error');
    });
  });
});
