import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DefaultArgs } from '@prisma/client/runtime/library';
import { BaseRepository } from 'src/base-repository/base.repository';
import { IncludeAllRelations } from 'src/base-repository/type';
import { PrismaService } from 'src/prisma/prisma.service';

type GameNestedIncludes = IncludeAllRelations<Prisma.$GamePayload['objects']>;

type GamePayload = Prisma.GameGetPayload<{
  include: GameNestedIncludes;
}>;

@Injectable()
export class GameRepository extends BaseRepository<
  Prisma.GameDelegate<DefaultArgs>,
  Prisma.GameCreateArgs,
  Prisma.GameFindManyArgs,
  Prisma.GameUpdateArgs,
  Prisma.GameDeleteArgs,
  GamePayload
> {
  constructor(private readonly prismaService: PrismaService) {
    super(prismaService.game);
  }
}
