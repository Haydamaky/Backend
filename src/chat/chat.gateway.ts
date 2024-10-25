import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ChatService } from './chat.service';
import { Server } from 'socket.io';
import { OnModuleInit, UseFilters, UseGuards } from '@nestjs/common';
import { Socket } from 'socket.io';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { WebsocketExceptionsFilter } from './filters/websocket-exceptions.filter';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { NewMessagePayload } from './dto';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
@UseFilters(new WebsocketExceptionsFilter())
export class ChatGateway implements OnModuleInit {
  @WebSocketServer()
  server: Server;

  constructor(private readonly chatService: ChatService) {}

  onModuleInit() {
    this.server.on('connection', (socket) => {});
  }

  @UseGuards(WsGuard)
  @SubscribeMessage('newMessage')
  async onNewMessage(
    socket: Socket & { jwtPayload: JwtPayload },
    data: NewMessagePayload
  ) {
    const message = await this.chatService.onNewMessage(
      socket.jwtPayload.sub,
      data
    );
    this.server.emit('onMessage', { ...data, ...message.sender });
  }

  @SubscribeMessage('chatData')
  onChatData(@MessageBody() data: { chatId: string }) {
    return this.chatService.onChatData(data.chatId);
  }
}
