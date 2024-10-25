import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { MessageModule } from 'src/message/message.module';

@Module({
  imports: [JwtModule, ConfigModule, MessageModule],
  providers: [ChatGateway, ChatService],
})
export class ChatModule {}
