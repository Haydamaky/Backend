import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ChatService } from './chat.service';
import { Server } from 'socket.io';
import { OnModuleInit, UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Socket } from 'socket.io';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { WebsocketExceptionsFilter } from '../utils/exceptions/websocket-exceptions.filter';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { NewGameMessageDto, NewMessagePayloadDto } from './dto';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
@UseFilters(WebsocketExceptionsFilter)
@UsePipes(new WsValidationPipe())
export class ChatGateway implements OnModuleInit {
  @WebSocketServer()
  server: Server;

  constructor(private readonly chatService: ChatService) {}

  onModuleInit() {
    this.server.on('connection', (socket) => {
      console.log('connected: ', socket.id);
    });
  }

  @UseGuards(WsGuard)
  @SubscribeMessage('newMessage')
  async onNewMessage(
    socket: Socket & { jwtPayload: JwtPayload },
    data: NewMessagePayloadDto
  ) {
    const message = await this.chatService.onNewMessage(
      socket.jwtPayload.sub,
      data
    );

    this.server.emit('onMessage', message);
  }

  @SubscribeMessage('newGameMessage')
  async onNewGameMessage(
    socket: Socket & { jwtPayload: JwtPayload },
    data: NewGameMessageDto
  ) {
    const message = await this.chatService.onNewMessage(
      socket.jwtPayload.sub,
      data
    );
    if (Array.from(socket.rooms).includes(data.gameId))
      this.server.to(data.gameId).emit('gameChatMessage', message);
  }

  @SubscribeMessage('chatData')
  onChatData(@MessageBody() data: { chatId: string }) {
    return this.chatService.onChatData(data.chatId);
  }
}
