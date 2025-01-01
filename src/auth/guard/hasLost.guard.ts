import { CanActivate, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { PlayerService } from 'src/player/player.service';

@Injectable()
export class HasLostGuard implements CanActivate {
  constructor(private playerService: PlayerService) {}

  async canActivate(context: any): Promise<boolean | any> {
    const client = context.switchToWs().getClient();
    const userId = client.jwtPayload.sub;
    try {
      const player = await this.playerService.findByUserAndGameId(
        userId,
        client.game.id
      );
      if (player?.lost) throw new WsException('U have already lost');
      client.player = player;
      return true;
    } catch (ex) {
      throw new WsException(ex.message);
    }
  }
}
