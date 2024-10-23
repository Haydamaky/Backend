import { Prisma } from '@prisma/client';

export abstract class BaseRepository<T> {
  constructor(private readonly prismaModel: any) {}

  async findAll(query?: {
    select?: any;
    include?: any;
    where?: any;
    orderBy?: any;
    cursor?: any;
    take?: number;
    skip?: number;
    distinct?: any;
  }): Promise<T[]> {
    return this.prismaModel.findMany(query);
  }

  async findOne(query: {
    select?: any;
    include?: any;
    where: any;
  }): Promise<T> {
    return this.prismaModel.findUnique(query);
  }
  async updateOne(query: {
    select?: any;
    include?: any;
    data: any;
    where: any;
  }): Promise<T> {
    return this.prismaModel.update(query);
  }
  async deleteOne(query: {
    select?: any;
    include?: any;
    where: any;
  }): Promise<T> {
    return this.prismaModel.delete(query);
  }

  async createOne(query: {
    select?: any;
    include?: any;
    data: any;
  }): Promise<T> {
    return this.prismaModel.create(query);
  }
}
