import { Test, TestingModule } from '@nestjs/testing';
import { PlayerGateway } from '../player.gateway';
import { PlayerService } from '../player.service';
import { CreatePlayerDto } from '../dto/create-player.dto';
import { PlayerRepository } from '../player.repository';

describe('PlayerGateway', () => {
  let gateway: PlayerGateway;
  let playerService: jest.Mocked<PlayerService>;

  const mockPlayerRepository: jest.Mocked<PlayerRepository> = {
    create: jest.fn(),
    findById: jest.fn(),
    findFirst: jest.fn(),
    updateById: jest.fn(),
    deleteById: jest.fn(),
  } as any;

  const mockPlayerService: jest.Mocked<PlayerService> = {
    playerRepository: mockPlayerRepository,
    create: jest.fn(),
    findFirst: jest.fn(),
    updateById: jest.fn(),
    decrementMoneyWithUserAndGameId: jest.fn(),
    findByUserAndGameId: jest.fn(),
    update: jest.fn(),
    incrementMoneyWithUserAndGameId: jest.fn(),
    deleteById: jest.fn(),
    COLORS: ['red', 'blue', 'green', 'yellow'],
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerGateway,
        { provide: PlayerService, useValue: mockPlayerService },
      ],
    }).compile();

    gateway = module.get<PlayerGateway>(PlayerGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
