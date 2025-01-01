import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { PlayerService } from './player.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { Server, Socket } from 'socket.io';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { GamePayload } from 'src/game/game.repository';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
@UseFilters(WebsocketExceptionsFilter)
@UsePipes(new WsValidationPipe())
@UseGuards(WsGuard)
export class PlayerGateway {
  constructor(private readonly playerService: PlayerService) {}
  @WebSocketServer() server: Server;
  @SubscribeMessage('test')
  async buyBranch(
    @ConnectedSocket()
    socket: Socket & { game: Partial<GamePayload> },
    @MessageBody('index') index: number
  ) {
    const fieldToBuyBranch = this.playerService.checkWhetherPlayerHasAllGroup(
      socket.game,
      index
    );
    this.playerService.buyBranch(socket.game, fieldToBuyBranch);
  }
}
