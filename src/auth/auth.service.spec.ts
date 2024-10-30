import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { mockPrismaService } from 'src/test-utils';

describe('AuthService', () => {
  let service: AuthService;
  let mockJwtService: Partial<JwtService>;
  let mockConfigService: Partial<ConfigService>;
  let mockMailService: Partial<MailService>;

  beforeEach(async () => {
    mockJwtService = {
      signAsync: (payload: unknown, options: unknown) => {
        return Promise.resolve('token');
      },
    };
    mockConfigService = {
      get: (envVar: string) => {
        return 'some var';
      },
    };
    mockMailService = {
      sendVerificationEmail: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
