import { Injectable } from '@nestjs/common';
import { NewMessagePayloadDto } from './dto';
import { ChatRepository } from './chat.repository';
import { MessageRepository } from 'src/message/message.repository';

@Injectable()
export class ChatService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly messageRepository: MessageRepository
  ) {}
  async onNewMessage(userId: string, messageObj: NewMessagePayloadDto) {
    return this.messageRepository.create({
      data: {
        text: messageObj.text,
        senderId: userId,
        chatId: messageObj.chatId,
      },
      include: {
        sender: {
          select: {
            userId: true,
            nickname: true,
          },
        },
      },
    });
  }

  async onChatData(chatId: string) {
    return await this.chatRepository.findUnique({
      where: { chatId },
      include: {
        messages: {
          include: {
            sender: {
              select: {
                userId: true,
                nickname: true,
              },
            },
          },
        },
      },
    });
  }
}
