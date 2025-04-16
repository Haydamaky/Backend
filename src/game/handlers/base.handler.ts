import { IHandler } from './IHandler';

export abstract class BaseHandler<T> implements IHandler {
  constructor(
    protected analyzer: T,
    private handler: () => void
  ) {}

  abstract canHandle(): boolean;
  handle() {
    this.handler();
  }
}
