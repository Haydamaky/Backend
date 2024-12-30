import { CanActivate, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { GameService } from 'src/game/game.service';
import { parse } from 'cookie';

@Injectable()
export class ActiveGameGuard implements CanActivate {
  constructor(private gameService: GameService) {}

  async canActivate(context: any): Promise<boolean | any> {
    const client = context.switchToWs().getClient();
    const { gameId } = parse(client.handshake.headers.cookie);
    try {
      const game = await this.gameService.getGame(gameId);
      if (game.status === 'ACTIVE')
        throw new WsException('Game is not active anymore');
      client.game = game;
      return true;
    } catch (ex) {
      throw new WsException(ex.message);
    }
  }
}
