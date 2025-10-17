import { CanActivate, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { PlayerService } from 'src/player/player.service';
import { parse } from 'cookie';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ValidPlayerGuard implements CanActivate {
  constructor(
    private playerService: PlayerService,
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  async canActivate(context: any): Promise<boolean | any> {
    const client = context.switchToWs().getClient();
    const data = context.switchToWs().getData();
    const userId = client.data.jwtPayload.sub;
    if (!userId) {
      if (!client.handshake.headers.cookie) {
        throw new WsException({
          code: 'USER_NOT_AUTHENTICATED',
          message: 'You must log in before performing this action',
          details: {
            action: 'ValidPlayerGuard',
          },
          requestId: data.requestId,
        });
      }
      const { accessToken } = parse(client.handshake.headers.cookie);
      try {
        const decoded = await this.jwtService.verify(accessToken, {
          publicKey: this.configService.get('ACCESS_TOKEN_PUB_KEY'),
        });
        client.data.jwtPayload = decoded;
      } catch (ex) {
        throw new WsException({
          code: 'USER_NOT_AUTHENTICATED',
          message: ex.message,
          details: {
            action: 'ValidPlayerGuard',
          },
          requestId: data.requestId,
        });
      }
    }
    let gameId = client.data.gameId;
    if (!gameId) {
      gameId = parse(client.handshake.headers.cookie).gameId;
    }
    if (!gameId)
      throw new WsException({
        code: 'USER_NOT_IN_GAME',
        message: 'You must join a game before performing this action',
        details: {
          action: 'ValidPlayerGuard',
        },
        requestId: data.requestId,
      });
    try {
      const player = await this.playerService.findByUserAndGameId(
        userId || client.data.jwtPayload.sub,
        gameId
      );
      if (player?.game?.status !== 'ACTIVE')
        throw new WsException({
          code: 'GAME_IS_NOT_ACTIVE',
          message: 'Game is not active anymore',
          details: {
            action: 'ValidPlayerGuard',
          },
          requestId: data.requestId,
        });
      if (player?.lost)
        throw new WsException({
          code: 'HAVE_ALREADY_LOST',
          message: 'You have already lost',
          details: {
            action: 'ValidPlayerGuard',
          },
          requestId: data.requestId,
        });
      client.player = player;
      client.game = player.game;
      return true;
    } catch (ex) {
      throw new WsException({
        code: 'UNHANDLED',
        message: 'Error occured with db',
        details: {
          action: 'ValidPlayerGuard',
        },
        requestId: data.requestId,
      });
    }
  }
}
