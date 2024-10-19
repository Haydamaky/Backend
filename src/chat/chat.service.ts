import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(prismaService: PrismaService) {}
  onNewMessage() {}
}
