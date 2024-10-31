import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SignInDto, SignUpDto } from './dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Tokens } from './types';
import * as argon2 from 'argon2';
import { JwtRtGuard } from './guard';
import { MailService } from 'src/mail/mail.service';
import { JwtPayload } from './types/jwtPayloadType.type';
import { UserRepository } from 'src/user/user.repository';

@Injectable()
export class AuthService {
  constructor(
    private userRepository: UserRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: MailService
  ) {}

  async signup(dto: SignUpDto) {
    try {
      const hashPasswordPromise = this.hashData(dto.password);
      const emailConfirmationTokenPromise = this.jwtService.signAsync(
        { email: dto.email },
        {
          expiresIn: '1h',
          algorithm: 'HS256',
          secret: this.configService.get('EMAIL_CONFIRM_SECRET'),
        }
      );
      const [hash, emailConfirmationToken] = await Promise.all([
        hashPasswordPromise,
        emailConfirmationTokenPromise,
      ]);
      await this.userRepository.create({
        data: {
          email: dto.email,
          hash,
          nickname: dto.nickname,
          emailConfirmationToken,
        },
      });
      this.emailService.sendVerificationEmail(
        dto.email,
        emailConfirmationToken
      );
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ForbiddenException('Credentials Already Taken');
        }
      } else {
        throw error;
      }
    }
  }

  async signin(dto: SignInDto) {
    //check user
    const user = await this.userRepository.findByEmail(dto.email);

    if (!user) {
      throw new ForbiddenException('Credentials are incorrect');
    }
    //check password
    const pwMatches = await argon2.verify(user.hash, dto.password);

    if (!pwMatches) {
      throw new ForbiddenException('Password is incorrect');
    }
    const tokens = await this.signTokens(user.userId, user.email);
    await this.updateRtHash(user.userId, tokens.refresh_token);
    return tokens;
  }

  async logout(userId: string) {
    await this.userRepository.updateMany({
      where: {
        userId,
        hashedRt: {
          not: null,
        },
      },
      data: {
        hashedRt: null,
      },
    });
  }
  @UseGuards(JwtRtGuard)
  async refreshTokens(userId: string, rt: string) {
    const user = await this.userRepository.findById(userId);

    if (!user) throw new ForbiddenException('Access Denied');
    if (!user.hashedRt) throw new ForbiddenException('Access Denied');

    const rtMatches = await argon2.verify(user.hashedRt, rt);
    if (!rtMatches) throw new ForbiddenException('Access Denied');

    const tokens = await this.signTokens(user.userId, user.email);
    await this.updateRtHash(user.userId, tokens.refresh_token);
    return tokens;
  }

  async signTokens(userId: string, email: string): Promise<Tokens> {
    const payLoad = {
      sub: userId,
      email,
    };
    const atPrivKey = this.configService.get<string>('ACCESS_TOKEN_PRIV_KEY');
    const rtPrivKey = this.configService.get<string>('REFRESH_TOKEN_PRIV_KEY');

    const [at_token, rt_token] = await Promise.all([
      this.jwtService.signAsync(payLoad, {
        expiresIn: '15min',
        privateKey: atPrivKey,
        algorithm: 'RS256',
      }),
      this.jwtService.signAsync(payLoad, {
        expiresIn: '30d',
        privateKey: rtPrivKey,
        algorithm: 'RS256',
      }),
    ]);

    return {
      access_token: at_token,
      refresh_token: rt_token,
    };
  }

  async confirmEmail(token: string) {
    const decodedToken = await this.jwtService.verify(token, {
      secret: this.configService.get('EMAIL_CONFIRM_SECRET'),
    });

    if (!decodedToken) {
      throw new BadRequestException('Invalid token');
    }

    const user = await this.userRepository.findByEmail(decodedToken.email);

    const tokens = await this.signTokens(user.userId, user.email);
    await this.updateRtHash(user.userId, tokens.refresh_token);
    return tokens;
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    confirmNewPassword: string
  ): Promise<void> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (newPassword !== confirmNewPassword) {
      throw new BadRequestException(
        // prettier-ignore
        'New password and confirmation don\'t match'
      );
    }

    const isPasswordMatch = await argon2.verify(user.hash, oldPassword);
    if (!isPasswordMatch) {
      throw new BadRequestException('Incorrect current password');
    }
    const newHash = await this.hashData(newPassword);

    await this.userRepository.update({
      where: { userId },
      data: { hash: newHash },
    });
  }

  async forgotPassword(email: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new BadRequestException('User not found');
    const forgotPasswordToken = await this.jwtService.signAsync(
      { email: email, sub: user.userId },
      {
        expiresIn: '1h',
        algorithm: 'HS256',
        secret: this.configService.get('RESET_PASSWORD_SECRET'),
      }
    );
    this.emailService.sendForgotPasswordEmail(email, forgotPasswordToken);
    return forgotPasswordToken;
  }

  async resetPassword(
    token: string,
    newPassword: string,
    confirmNewPassword: string
  ) {
    if (newPassword !== confirmNewPassword) {
      throw new BadRequestException(
        // prettier-ignore
        'New password and confirmation don\'t match'
      );
    }

    const decodedToken = await this.verifyResetToken(token);

    const newHash = await this.hashData(newPassword);

    await this.userRepository.update({
      where: { email: decodedToken.email },
      data: { hash: newHash, hashedRt: null },
    });
  }

  async verifyResetToken(token: string): Promise<JwtPayload> {
    try {
      const decodedToken = await this.jwtService.verify(token, {
        secret: this.configService.get('RESET_PASSWORD_SECRET'),
      });
      return decodedToken;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new BadRequestException('Reset password token has expired.');
      } else if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid reset password token.');
      }
      throw new BadRequestException('Error verifying reset password token.');
    }
  }

  async updateRtHash(userId: string, rt: string) {
    const hash = await argon2.hash(rt);

    await this.userRepository.update({
      where: {
        userId,
      },
      data: {
        hashedRt: hash,
      },
    });
  }

  async hashData(data: string) {
    const hash = await argon2.hash(data);
    return hash;
  }
}
