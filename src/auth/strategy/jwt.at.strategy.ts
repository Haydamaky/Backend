import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { JwtPayload } from '../types/jwtPayloadType.type';
import { Request } from 'express';

@Injectable()
export class JwtAtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const token = request.cookies['accessToken'];
          return token;
        },
      ]),
      secretOrKey: config.get('ACCESS_TOKEN_PUB_KEY'),
      algorithms: ['RS256'],
    });
  }
  validate(payload: JwtPayload) {
    return payload;
  }
}
