export interface Delegate<T> {
  aggregate(data: unknown): any;
  count(data: unknown): Promise<number>;
  create(data: unknown): Promise<Partial<T>>;
  delete(data: unknown): Promise<Partial<T>>;
  deleteMany(data: unknown): Promise<{ count: number }>;
  findFirst(data: unknown): Promise<Partial<T>>;
  findMany(data: unknown): Promise<Partial<T>[]>;
  findUnique(data: unknown): Promise<Partial<T>>;
  update(data: unknown): Promise<Partial<T>>;
  updateMany(data: unknown): Promise<{ count: number }>;
  upsert(data: unknown): Promise<Partial<T>>;
}