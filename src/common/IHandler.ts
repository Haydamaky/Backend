export interface IHandler {
  canHandle(): boolean | void;
  handle(): void;
}
