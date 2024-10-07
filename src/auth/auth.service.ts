import { ForbiddenException, Injectable, UseGuards } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SignInDto, SignUpDto } from './dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Tokens } from './types';
import * as argon2 from 'argon2';
import { JwtRtGuard } from './guard';

@Injectable({})
export class AuthService {
  constructor(
    private prismaService: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  async signup(dto: SignUpDto): Promise<Tokens> {
    try {
      const hash = await this.hashData(dto.password);
      const user = await this.prismaService.user.create({
        data: {
          email: dto.email,
          hash,
          nickname: dto.nickname,
        },
      });

      const tokens = await this.signTokens(user.id, user.email);
      await this.updateRtHash(user.id, tokens.refresh_token);
      return tokens;
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
    const user = await this.prismaService.user.findUnique({
      where: {
        email: dto.email as string,
      },
    });

    if (!user) {
      throw new ForbiddenException('Credentials are incorrect');
    }
    //check password
    const pwMatches = await argon2.verify(user.hash, dto.password);
    if (!pwMatches) throw new ForbiddenException('Access Denied');

    if (!pwMatches) {
      throw new ForbiddenException('Password is incorrect');
    }
    const tokens = await this.signTokens(user.id, user.email);
    await this.updateRtHash(user.id, tokens.refresh_token);
    return tokens;
  }

  async logout(userId: number) {
    await this.prismaService.user.updateMany({
      where: {
        id: userId,
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
  async refreshTokens(userId: number, rt: string) {
    const user = await this.prismaService.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) throw new ForbiddenException('Access Denied');
    if (!user.hashedRt) throw new ForbiddenException('Access Denied');

    const rtMatches = await argon2.verify(user.hashedRt, rt);
    if (!rtMatches) throw new ForbiddenException('Access Denied');

    const tokens = await this.signTokens(user.id, user.email);
    await this.updateRtHash(user.id, tokens.refresh_token);
    return tokens;
  }

  async signTokens(userId: number, email: string): Promise<Tokens> {
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

  async updateRtHash(userId: number, rt: string) {
    const hash = await argon2.hash(rt);

    await this.prismaService.user.update({
      where: {
        id: userId,
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
