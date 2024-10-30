import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DefaultArgs } from '@prisma/client/runtime/library';
import { BaseRepository } from 'src/base-repository/base.repository';
import { PrismaService } from 'src/prisma/prisma.service';

export type UserPayload = Prisma.$UserPayload['objects'] &
  Prisma.$UserPayload['scalars'];

@Injectable()
export class UserRepository extends BaseRepository<
  Prisma.UserDelegate<DefaultArgs>,
  Prisma.UserCreateArgs,
  Prisma.UserFindManyArgs,
  Prisma.UserUpdateArgs,
  Prisma.UserDeleteArgs,
  UserPayload
> {
  constructor(private readonly prismaService: PrismaService) {
    super(prismaService.user);
  }

  findByEmail(email: string) {
    return this.findFirst({ where: { email } });
  }
}
