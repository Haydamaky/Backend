import { CanActivate, Injectable } from '@nestjs/common';
import { parse } from 'cookie';
import { WsException } from '@nestjs/websockets';
import { GameService } from 'src/game/game.service';

@Injectable()
export class TurnGuard implements CanActivate {
  constructor(private gameService: GameService) {}

  async canActivate(context: any): Promise<boolean | any> {
    const client = context.switchToWs().getClient();
    const userId = client.jwtPayload.sub;
    const { gameId } = parse(client.handshake.headers.cookie);
    try {
      const game = await this.gameService.getCurrentGame(gameId);
      if (game?.turnOfUserId !== userId) throw new WsException('Wrong turn');
      client.game = game;
      return game;
    } catch (ex) {
      throw new WsException(ex.message);
    }
  }
}
