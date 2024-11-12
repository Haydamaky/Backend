import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { parse } from 'cookie';

export const GetGameId = createParamDecorator(
  (_: undefined, context: ExecutionContext): string => {
    const client = context.switchToWs().getClient();
    if (!client.handshake.headers.cookie) {
      throw new WsException('Unauthorized');
    }

    const { gameId } = parse(client.handshake.headers.cookie);
    console.log({ gameId });
    return gameId;
  }
);
