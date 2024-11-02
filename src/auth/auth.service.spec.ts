import {
  DefaultArgs,
  PrismaClientKnownRequestError,
} from '@prisma/client/runtime/library';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { UserPayload, UserRepository } from 'src/user/user.repository';
import { Prisma, User } from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let mockJwtService: Partial<JwtService>;
  let mockMailService: Partial<MailService>;
  let mockUserRepo: Partial<UserRepository>;
  const signingUser = {
    email: 'test@gmail.com',
    password: '123456',
    nickname: 'test',
  };
  beforeEach(async () => {
    const users: User[] = [];
    mockJwtService = {
      signAsync: (payload: unknown, options: unknown) => {
        return Promise.resolve('token');
      },
      verify: jest.fn(),
    };
    mockMailService = {
      sendVerificationEmail: jest.fn(),
      sendForgotPasswordEmail: jest.fn(),
    };
    mockUserRepo = {
      findByEmail: (email: string) => {
        const [user] = users.filter((user) => user.email === email);
        return Promise.resolve(user);
      },
      findById: (userId: string) => {
        const [user] = users.filter((user) => user.userId === userId);
        return Promise.resolve(user);
      },
      create: async (createArgs: Prisma.UserCreateArgs<DefaultArgs>) => {
        const user = await mockUserRepo.findByEmail(createArgs.data.email);
        if (user) {
          throw new PrismaClientKnownRequestError('prisma error', {
            code: 'P2002',
            clientVersion: '1',
          });
        }
        users.push({
          ...createArgs.data,
          hashedRt: 'hashedRt',
          emailConfirmationToken: createArgs.data.emailConfirmationToken,
          userId: 'id',
          createdAt: new Date(),
          updatedAt: new Date(),
          isEmailConfirmed: false,
        });
        return Promise.resolve(createArgs.data as unknown as UserPayload);
      },
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        ConfigService,
        {
          provide: UserRepository,
          useValue: mockUserRepo,
        },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create user with hash and email confirmation token', async () => {
    service.hashData = jest.fn().mockReturnValue(Promise.resolve('hash'));
    await service.signup(signingUser);
    const user = await mockUserRepo.findByEmail('test@gmail.com');
    expect(user.hash).toBeDefined();
    expect(user.hash).toBe('hash');
    expect(user.emailConfirmationToken).toBeDefined();
  });

  it('should sendVerificationEmail on users email with verification token', async () => {
    await service.signup(signingUser);
    await mockUserRepo.findByEmail('test@gmail.com');
    expect(mockMailService.sendVerificationEmail).toHaveBeenCalledWith(
      'test@gmail.com',
      'token'
    );
  });

  it('should throw ForbiddenException if prisma sends error code P2002', async () => {
    await service.signup(signingUser);
    await expect(service.signup(signingUser)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw ForbiddenException if user with such email doest exist', async () => {
    await expect(
      service.signin({
        email: signingUser.email,
        password: signingUser.password,
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it('throw a ForbiddenException if password doesnt match', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    await expect(
      service.signin({
        email: signingUser.email,
        password: signingUser.password,
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it('should return tokens if signed in successfully', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    service.signTokens = jest.fn().mockReturnValue(
      Promise.resolve({
        access_token: 'at_token',
        refresh_token: 'rt_token',
      })
    );
    await service.signup(signingUser);
    const tokens = await service.signin({
      email: signingUser.email,
      password: signingUser.password,
    });
    expect(tokens).toStrictEqual({
      access_token: 'at_token',
      refresh_token: 'rt_token',
    });
  });

  it('should delete hashedRt from user if its not null', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    await service.signup(signingUser);
    await service.signin({
      email: signingUser.email,
      password: signingUser.password,
    });
    await service.logout('id');
    expect(mockUserRepo.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'id',
        hashedRt: {
          not: null,
        },
      },
      data: {
        hashedRt: null,
      },
    });
  });

  it('should throw an ForbiddenException if user with such id doesnt exist', async () => {
    expect(service.refreshTokens('non-existed', 'token')).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw an ForbiddenException if hashedRt doesnt exist', async () => {
    await service.signup(signingUser);
    const user = await mockUserRepo.findById('id');
    delete user['hashedRt'];
    expect(service.refreshTokens('id', 'someHashRt')).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw an ForbiddenException if hashedRt in db doesnt match with given', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    await service.signup(signingUser);
    expect(service.refreshTokens('id', 'wrongHashRt')).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should return tokens if user with given Id has rt and it matches with input', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    await service.signup(signingUser);
    const tokens = await service.refreshTokens('id', 'hashedRt');
    expect(tokens).toStrictEqual({
      access_token: 'token',
      refresh_token: 'token',
    });
  });

  it('should sign tokens and return them', async () => {
    const tokens = await service.signTokens('id', signingUser.email);
    expect(tokens).toStrictEqual({
      access_token: 'token',
      refresh_token: 'token',
    });
  });

  it('should throw an BadRequestException if token is invalid', () => {
    (mockJwtService.verify as jest.Mock).mockReturnValue(null);
    expect(service.confirmEmail('token')).rejects.toThrow(BadRequestException);
  });

  it('should return tokens after confirmation of email', async () => {
    (mockJwtService.verify as jest.Mock).mockReturnValue({
      userId: 'id',
      email: 'test@gmail.com',
    });
    await service.signup(signingUser);
    const tokens = await service.confirmEmail('token');
    expect(tokens).toStrictEqual({
      access_token: 'token',
      refresh_token: 'token',
    });
  });

  it('should call updateRtHash with userId and new refresh token', async () => {
    (mockJwtService.verify as jest.Mock).mockReturnValue({
      userId: 'id',
      email: 'test@gmail.com',
    });
    service.updateRtHash = jest.fn();
    await service.signup(signingUser);
    await service.confirmEmail('token');
    expect(service.updateRtHash).toHaveBeenCalledWith('id', 'token');
  });

  it('should throw BadRequestException if user with such email doesnt exist', async () => {
    await expect(
      service.changePassword('noId', '12345', '12345', '12345')
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException if new password doesnt match confirm password', async () => {
    await service.signup(signingUser);
    await expect(
      service.changePassword('id', '12345', '12345', 'nomatch')
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException if input password doesnt match with old', async () => {
    (mockJwtService.verify as jest.Mock).mockReturnValue(null);
    await expect(
      service.changePassword('id', 'nomatch', '654321', '654321')
    ).rejects.toThrow(BadRequestException);
  });

  it('should hash the new password and update db with it', async () => {
    (mockJwtService.verify as jest.Mock).mockReturnValue(true);
    service.hashData = jest.fn().mockReturnValue(Promise.resolve('hash'));
    await service.signup(signingUser);
    await service.changePassword('id', '123456', '654321', '654321');
    expect(service.hashData).toHaveBeenCalledWith('654321');
    expect(mockUserRepo.update).toHaveBeenCalled();
  });

  it('should throw BadReqException if user doesnt exist', async () => {
    await expect(service.forgotPassword('noemail')).rejects.toThrow(
      BadRequestException
    );
  });

  it('should return forgot password token', async () => {
    await service.signup(signingUser);
    const forgotToken = await service.forgotPassword('test@gmail.com');
    expect(forgotToken).toBe('token');
  });

  it('should send sendForgotPasswordEmail', async () => {
    await service.signup(signingUser);
    await service.forgotPassword('test@gmail.com');
    expect(mockMailService.sendForgotPasswordEmail).toHaveBeenCalledWith(
      signingUser.email,
      'token'
    );
  });

  it('should throw BadReqException if new and confirmed password dont mathc', async () => {
    await expect(
      service.resetPassword('token', '123456', 'nomatch')
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadReqException if new and confirmed password dont mathc', async () => {
    service.verifyResetToken = jest
      .fn()
      .mockResolvedValue({ email: signingUser.email });
    service.hashData = jest.fn().mockResolvedValue('hash');
    await service.signup(signingUser);
    await service.resetPassword('token', '654321', '654321');
    expect(service.verifyResetToken).toHaveBeenCalledWith('token');
    expect(service.hashData).toHaveBeenCalledWith('654321');
    expect(mockUserRepo.update).toHaveBeenCalledWith({
      where: { email: signingUser.email },
      data: { hash: 'hash', hashedRt: null },
    });
  });

  it('should throw BadReqError if req is token is wrong', async () => {
    (mockJwtService.verify as jest.Mock).mockRejectedValue({
      name: 'TokenExpiredError',
    });
    await expect(service.verifyResetToken('token')).rejects.toThrow(
      BadRequestException
    );
  });

  it('should return decoded token', async () => {
    (mockJwtService.verify as jest.Mock).mockReturnValue({
      email: 'test@gmail.com',
    });
    const decodedToken = await service.verifyResetToken('token');
    expect(decodedToken).toStrictEqual({ email: 'test@gmail.com' });
  });

  it('should call argon2.hash and save to db', async () => {
    (argon2.hash as jest.Mock).mockResolvedValue('hash');
    await service.updateRtHash('id', 'token');
    expect(argon2.hash).toHaveBeenCalledWith('token');
    expect(mockUserRepo.update).toHaveBeenCalledWith({
      where: {
        userId: 'id',
      },
      data: {
        hashedRt: 'hash',
      },
    });
  });

  it('should call argon2 with given data and return hash', async () => {
    (argon2.hash as jest.Mock).mockResolvedValue('hash');
    const hash = await service.hashData('someString');
    expect(hash).toBe('hash');
  });
});
