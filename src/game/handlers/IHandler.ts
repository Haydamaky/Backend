export interface IHandler {
  canHandle(): boolean;
  handle(): void;
}
