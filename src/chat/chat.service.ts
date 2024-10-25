import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NewMessagePayloadDto } from './dto';

@Injectable()
export class ChatService {
  constructor(private prismaService: PrismaService) {}
  async onNewMessage(userId: string, messageObj: NewMessagePayloadDto) {
    const res = await this.prismaService.message.create({
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
    return res;
  }

  async onChatData(chatId: string) {
    return await this.prismaService.chat.findFirst({
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
