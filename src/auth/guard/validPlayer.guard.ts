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
    const userId = client.data.jwtPayload.sub;
    if (!userId) {
      if (!client.handshake.headers.cookie) {
        throw new WsException('Unauthorized');
      }
      const { access_token } = parse(client.handshake.headers.cookie);
      try {
        const decoded = await this.jwtService.verify(access_token, {
          publicKey: this.configService.get('ACCESS_TOKEN_PUB_KEY'),
        });
        client.data.jwtPayload = decoded;
      } catch (ex) {
        throw new WsException(ex.message);
      }
    }
    let gameId = client.data.gameId;
    if (!gameId) {
      gameId = parse(client.handshake.headers.cookie);
    }
    try {
      const player = await this.playerService.findByUserAndGameId(
        userId || client.data.jwtPayload.sub,
        gameId
      );
      if (player?.game?.status !== 'ACTIVE')
        throw new WsException('Game is not active anymore');
      if (player?.lost) throw new WsException('You have already lost');
      client.player = player;
      client.game = player.game;
      return true;
    } catch (ex) {
      throw new WsException(ex.message);
    }
  }
}
