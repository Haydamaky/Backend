import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ChatService } from './chat.service';
import { Server } from 'socket.io';
import { OnModuleInit, UseGuards } from '@nestjs/common';
import { GetCurrentUser } from 'src/auth/decorator';
import { JwtGuard } from 'src/auth/guard';
import { User } from '@prisma/client';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
@UseGuards(JwtGuard)
export class ChatGateway implements OnModuleInit {
  @WebSocketServer()
  server: Server;

  constructor(private readonly chatService: ChatService) {}

  onModuleInit() {
    this.server.on('connection', (socket) => {
      console.log(socket.id);
      console.log('connecteds');
    });
  }

  @UseGuards(JwtGuard)
  @SubscribeMessage('newMessage')
  onNewMessage(@MessageBody() body: any, @GetCurrentUser() user: User) {
    console.log(user);
    this.server.emit('onMessage', body);
  }
}
