import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DefaultArgs } from '@prisma/client/runtime/library';
import { BaseRepository } from 'src/base-repository/base.repository';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ChatRepository extends BaseRepository<
  Prisma.ChatDelegate<DefaultArgs>,
  Prisma.ChatCreateArgs,
  Prisma.ChatFindManyArgs,
  Prisma.ChatUpdateArgs,
  Prisma.ChatDeleteArgs
> {
  constructor(private readonly prismaService: PrismaService) {
    super(prismaService.chat);
  }
}
