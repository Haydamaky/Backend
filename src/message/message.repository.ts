import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DefaultArgs } from '@prisma/client/runtime/library';
import { BaseRepository } from 'src/base-repository/base.repository';
import { PrismaService } from 'src/prisma/prisma.service';

type MessagePayload = Prisma.$MessagePayload['objects'] &
  Prisma.$MessagePayload['scalars'];

@Injectable()
export class MessageRepository extends BaseRepository<
  Prisma.MessageDelegate<DefaultArgs>,
  Prisma.MessageCreateArgs,
  Prisma.MessageFindManyArgs,
  Prisma.MessageUpdateArgs,
  Prisma.MessageDeleteArgs,
  MessagePayload
> {
  constructor(private readonly prismaService: PrismaService) {
    super(prismaService.message);
  }
}
