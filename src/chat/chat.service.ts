import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prismaService: PrismaService) {}
  onNewMessage(userId: number, message: string) {
    console.log(userId, message);
    //this.prismaService.message.create({});
  }
}
