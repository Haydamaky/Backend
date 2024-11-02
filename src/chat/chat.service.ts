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
            id: true,
            nickname: true,
          },
        },
      },
    });
  }

  async onChatData(id: string) {
    return await this.chatRepository.findUnique({
      where: { id },
      include: {
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                nickname: true,
              },
            },
          },
        },
      },
    });
  }
}
