import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { JwtPayload } from '../types/jwtPayloadType.type';
import { Request } from 'express';
import { Socket } from 'socket.io';
import { parse } from 'cookie';

@Injectable()
export class JwtAtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (client: Socket) => {
          const cookies = parse(client.handshake.headers.cookie);
          return cookies.access_token;
        },
        (request: Request) => {
          const token = request.cookies['access_token'];
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
