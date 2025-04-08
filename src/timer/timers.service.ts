import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TimerService {
  private readonly logger = new Logger(TimerService.name);
  constructor() {}
  timers: Map<
    string,
    { timer: NodeJS.Timeout; reject: (message: string) => void }
  > = new Map();
  set<T, R>(
    id: string,
    time: number,
    args: T,
    callback: (args: T) => Promise<R> | R
  ): Promise<R> | null {
    this.clear(id);
    return new Promise<R>((resolve, reject) => {
      const timer = setTimeout(async () => {
        try {
          const res: R = await callback(args);
          resolve(res);
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.log('In Timer');
          console.log(error.message);
          reject(error);
        }
      }, time);
      this.timers.set(id, { timer, reject });
      this.logger.log(`Timer with id:${id} was set for ${time / 1000} seconds`);
    }).catch(() => {
      return null;
    });
  }
  clear(gameId: string) {
    if (this.timers.has(gameId)) {
      const timer = this.timers.get(gameId);
      clearTimeout(timer.timer);
      this.timers.delete(gameId);
      this.logger.log(`Cleared timer for game ${gameId}.`);
    }
  }

  calculateFutureTime(duration: number) {
    let currentTime = Date.now();
    currentTime += duration;
    return currentTime.toString();
  }
}
