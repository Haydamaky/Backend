import { IHandler } from './IHandler';

export class HandlerChain {
  private handlers: IHandler[] = [];
  addHandlers(...handlers: IHandler[]): void {
    this.handlers.push(...handlers);
  }

  process(): unknown | Promise<unknown> {
    for (const handler of this.handlers) {
      if (handler.canHandle()) {
        return handler.handle();
      }
    }
    console.log('No handler found for this data');
  }
}
