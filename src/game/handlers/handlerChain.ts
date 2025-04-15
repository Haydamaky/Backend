import { IHandler } from './IHandler';

export class HandlerChain {
  private handlers: IHandler[] = [];
  addHandlers(...handlers: IHandler[]): void {
    this.handlers.push(...handlers);
  }

  process(): void {
    for (const handler of this.handlers) {
      if (handler.canHandle()) {
        handler.handle();
        return;
      }
    }
    console.log('No handler found for this data');
  }
}
