import { CanActivate, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { PlayerService } from 'src/player/player.service';
import { parse } from 'cookie';

@Injectable()
export class ValidPlayerGuard implements CanActivate {
  constructor(private playerService: PlayerService) {}

  async canActivate(context: any): Promise<boolean | any> {
    const client = context.switchToWs().getClient();
    const userId = client.jwtPayload.sub;
    const { gameId } = parse(client.handshake.headers.cookie);
    try {
      const player = await this.playerService.findByUserAndGameId(
        userId,
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
