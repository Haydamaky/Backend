import { Delegate } from './type';

export abstract class BaseRepository<M extends Delegate<P>, C, R, U, D, P> {
  constructor(private readonly model: M) {}

  create(data: C) {
    return this.model.create(data);
  }
  findById(id: string) {
    return this.findFirst({ where: { id } });
  }

  updateById(id: string, data: U['data' & 1]) {
    return this.update({ where: { id }, data });
  }

  deleteById(id: string) {
    return this.delete({ where: { id } });
  }

  findFirst(data?: R | { where: R['where' & 0] | { id: string } }) {
    return this.model.findFirst(data);
  }

  findUnique(data?: R | { where: R['where' & 0] | { id: string } }) {
    return this.model.findUnique(data);
  }

  findMany(data?: R) {
    return this.model.findMany(data);
  }

  update(
    data: U | { where: Partial<P> | { id: string }; data: U['data' & 1] }
  ) {
    return this.model.update(data);
  }

  delete(data: D | { where: { id: string } }) {
    return this.model.delete(data);
  }

  updateMany(data: U) {
    return this.model.updateMany(data);
  }
}
