import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EventService {
  constructor(private eventEmitter: EventEmitter2) {}

  emitGameEvent(eventName: string, data: any) {
    this.eventEmitter.emit(eventName, data);
  }
}
