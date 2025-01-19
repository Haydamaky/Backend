import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DefaultArgs } from '@prisma/client/runtime/library';
import { BaseRepository } from 'src/base-repository/base.repository';
import { IncludeAllRelations } from 'src/base-repository/type';
import { PrismaService } from 'src/prisma/prisma.service';

type PlayerNestedIncludes = IncludeAllRelations<
  Prisma.$PlayerPayload['objects']
>;

export type PlayerPayload = Prisma.PlayerGetPayload<{
  include: PlayerNestedIncludes;
}>;

@Injectable()
export class PlayerRepository extends BaseRepository<
  Prisma.PlayerDelegate<DefaultArgs>,
  Prisma.PlayerCreateArgs,
  Prisma.PlayerFindManyArgs,
  Prisma.PlayerUpdateArgs,
  Prisma.PlayerDeleteArgs,
  PlayerPayload
> {
  constructor(private readonly prismaService: PrismaService) {
    super(prismaService.player);
  }
}
