import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TurnGuard, ValidPlayerGuard } from 'src/auth/guard';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { GamePayload } from 'src/game/game.repository';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { PlayerService } from './player.service';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';

@WebSocketGateway({
  cors: {
    origin:
      process.env.NODE_ENV === 'development'
        ? process.env.FRONTEND_URL_DEV
        : process.env.FRONTEND_URL_PROD,
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
@UseFilters(WebsocketExceptionsFilter)
@UsePipes(new WsValidationPipe())
@UseGuards(WsGuard, ValidPlayerGuard)
export class PlayerGateway {
  constructor(private readonly playerService: PlayerService) {}
  @WebSocketServer()
  private server: Server;

  @UseGuards(TurnGuard, ValidPlayerGuard)
  @SubscribeMessage('unmortgageField')
  async onUnmortgageField(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload>; jwtPayload: JwtPayload },
    @MessageBody() dataArray: [{ index: number }, null]
  ) {
    const data = dataArray[0];
    const { index } = data;
    const game = socket.game;
    const userId = socket.jwtPayload.sub;
    const { player, fields } = await this.playerService.unmortgageField(
      game,
      index,
      userId
    );
    this.server.to(game.id).emit('updateGameData', {
      fields,
      game: player.game,
    });
  }
}
