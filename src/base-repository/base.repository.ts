import { Delegate } from './type';

export abstract class BaseRepository<M extends Delegate<P>, C, R, U, D, P> {
  constructor(private readonly model: M) {}

  create(data: C) {
    return this.model.create(data);
  }
  findById(id: string) {
    return this.model.findFirst({ where: { id } });
  }

  updateById(id: string, data: unknown) {
    return this.model.update({ where: { id }, data });
  }

  deleteById(id: string) {
    return this.model.delete({ where: { id } });
  }

  findFirst(data?: R) {
    return this.model.findFirst(data);
  }

  findUnique(data?: R) {
    return this.model.findUnique(data);
  }

  findMany(data?: R) {
    return this.model.findMany(data);
  }

  update(data: U) {
    return this.model.update(data);
  }

  delete(data: D) {
    return this.model.delete(data);
  }

  updateMany(data: U) {
    return this.model.updateMany(data);
  }
}
