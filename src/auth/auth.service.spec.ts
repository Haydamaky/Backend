import { DefaultArgs } from '@prisma/client/runtime/library';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { UserPayload, UserRepository } from 'src/user/user.repository';
import { Prisma } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let mockJwtService: Partial<JwtService>;
  let mockConfigService: Partial<ConfigService>;
  let mockMailService: Partial<MailService>;
  let mockUserRepo: Partial<UserRepository>;

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
    mockUserRepo = {
      create: (data: Prisma.UserCreateArgs<DefaultArgs>) => {
        return Promise.resolve(data as unknown as UserPayload);
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserRepository,
          useValue: mockUserRepo,
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
