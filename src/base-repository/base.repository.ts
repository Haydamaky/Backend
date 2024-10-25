import { Prisma } from '@prisma/client';
import { Delegate } from './type';
import { PrismaService } from 'src/prisma/prisma.service';

export abstract class BaseRepository<M extends Delegate, C, R, U, D> {
  constructor(private readonly model: M) {}

  async create(data: C) {
    return this.model.create(data);
  }
  async findUnique(data?: R) {
    return this.model.findUnique(data);
  }
  async findMany(data?: R) {
    return this.model.findMany(data);
  }
  async update(data: U) {
    return this.model.update(data);
  }
  async delete(data: D) {
    return this.model.delete(data);
  }
}
