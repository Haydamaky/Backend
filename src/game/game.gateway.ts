import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
} from '@nestjs/websockets';
import { GameService } from './game.service';
import { Server, Socket } from 'socket.io';
import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
@UseFilters(WebsocketExceptionsFilter)
@UsePipes(new WsValidationPipe())
export class GameGateway {
  constructor(private gameService: GameService) {}

  @WebSocketServer() server: Server;

  private leaveAllRoomsExceptInitial(socket: Socket) {
    const rooms = socket.rooms;
    let i = 0;
    rooms.forEach((room) => {
      if (i !== 0) {
        socket.leave(room);
      }
      i++;
    });
  }

  @UseGuards(WsGuard)
  @SubscribeMessage('joinGame')
  async joinGame(
    socket: Socket & { jwtPayload: JwtPayload },
    data: { id: string }
  ) {
    const { game, shouldStart } = await this.gameService.joinGame(
      data.id,
      socket.jwtPayload.sub
    );
    if (game) {
      this.leaveAllRoomsExceptInitial(socket);
      socket.join(data.id);
      this.server.emit('onParticipateGame', {
        id: game.id,
        players: game.players,
      });
      if (shouldStart) {
        // We can setTimeout here for some countdown on frontend
        this.server.to(game.id).emit('startGame', { gameId: game.id });
        this.server.emit('clearStartedGame', {
          gameId: game.id,
        });
      }
    }
  }

  @UseGuards(WsGuard)
  @SubscribeMessage('leaveGame')
  async leaveGame(
    socket: Socket & { jwtPayload: JwtPayload },
    data: { id: string }
  ) {
    const game = await this.gameService.leaveGame(
      data.id,
      socket.jwtPayload.sub
    );
    if (game) {
      this.leaveAllRoomsExceptInitial(socket);
      this.server.emit('onParticipateGame', {
        id: data.id,
        players: game.players,
      });
    }
  }
}
