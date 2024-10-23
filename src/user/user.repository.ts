import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BaseRepository } from 'src/base-repository/base.repository';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserRepository extends BaseRepository<
  Prisma.UserGetPayload<true>
> {
  constructor(private readonly prismaService: PrismaService) {
    super(prismaService.user);
  }
}
