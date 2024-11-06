import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import * as jwt from 'jsonwebtoken';
import { AuthService } from '../auth.service';
import { JwtRtGuard } from './jwt.refresh.guard';
import { JwtPayloadWithRt } from '../types/jwtPayloadWithRt.type';
import { DEFAULT_CIPHERS } from 'tls';
import { decode } from 'punycode';

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly jwtRefreshGuard: JwtRtGuard
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest() as Request & {
      cookies: object;
    } & { user: JwtPayloadWithRt };

    const res = context.switchToHttp().getRequest() as Response;

    const { access_token, refresh_token } = req.cookies as {
      access_token: string;
      refresh_token: string;
    };

    if (!access_token && !refresh_token) return super.canActivate(context);

    await this.jwtRefreshGuard.canActivate(context);

    const decodedRT = req?.user;

    try {
      const accessTokenDecoded = jwt.verify(
        access_token,
        this.configService.get('ACCESS_TOKEN_PUB_KEY')
      );
    } catch (err) {
      if (err instanceof jwt.JsonWebTokenError)
        return super.canActivate(context);

      if (err instanceof jwt.TokenExpiredError) {
      }
    }

    if (isPublic) return true;

    return super.canActivate(context);
  }
}
