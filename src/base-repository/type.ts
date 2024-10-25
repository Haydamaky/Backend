export interface Delegate {
  aggregate(data: unknown): any;
  count(data: unknown): any;
  create(data: unknown): any;
  delete(data: unknown): any;
  deleteMany(data: unknown): any;
  findFirst(data: unknown): any;
  findMany(data: unknown): any;
  findUnique(data: unknown): any;
  update(data: unknown): any;
  updateMany(data: unknown): any;
  upsert(data: unknown): any;
}
