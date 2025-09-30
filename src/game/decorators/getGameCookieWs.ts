import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { parse } from 'cookie';

export const GetGameId = createParamDecorator(
  (_: undefined, context: ExecutionContext): string => {
    const client = context.switchToWs().getClient();
    const { gameId } = parse(client.handshake.headers.cookie);
    if (!gameId)
      throw new WsException({
        code: 'USER_NOT_IN_GAME',
        message: 'You must join a game before performing this action',
        details: {
          action: 'GetGameId',
        },
      });
    return gameId;
  }
);
