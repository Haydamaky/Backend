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
    if (!client.handshake.headers.cookie) {
      throw new WsException('Unauthorized');
    }
    const userId = client.data.jwtPayload?.sub;
    if (userId) {
      return true;
    }
    const { access_token } = parse(client.handshake.headers.cookie);
    try {
      const decoded = await this.jwtService.verify(access_token, {
        publicKey: this.configService.get('ACCESS_TOKEN_PUB_KEY'),
      });
      client.data.jwtPayload = decoded;
      return decoded;
    } catch (ex) {
      throw new WsException(ex.message);
    }
  }
}
