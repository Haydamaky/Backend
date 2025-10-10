import { CanActivate, Injectable } from '@nestjs/common';
import { parse } from 'cookie';
import { WsException } from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class WsGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private jwtService: JwtService
  ) {}

  async canActivate(context: any): Promise<boolean | any> {
    const client = context.switchToWs().getClient();
    const data = context.switchToWs().getData();
    if (!client.handshake.headers.cookie) {
      throw new WsException({
        code: 'USER_NOT_AUTHENTICATED',
        message: 'You must log in before performing this action',
        details: {
          action: 'WsGuard',
        },
        requestId: data.requestId,
      });
    }
    const userId = client.data.jwtPayload?.sub;
    if (userId) {
      return true;
    }
    const { accessToken } = parse(client.handshake.headers.cookie);
    try {
      const decoded = await this.jwtService.verify(accessToken, {
        publicKey: this.configService.get('ACCESS_TOKEN_PUB_KEY'),
      });
      client.data.jwtPayload = decoded;
      return decoded;
    } catch (ex) {
      throw new WsException({
        code: 'USER_NOT_AUTHENTICATED',
        message: ex.message,
        requestId: data.requestId,
        details: {
          action: 'WsGuard',
        },
      });
    }
  }
}
