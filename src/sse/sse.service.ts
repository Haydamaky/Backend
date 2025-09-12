import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

interface SseEvent {
  room?: string;
  userId?: string;
  data: any;
}

@Injectable()
export class SseService {
  private eventSubject = new Subject<SseEvent>();
  onModuleInit() {
    setInterval(() => {
      this.sendToAll({
        data: { hello: 'world', time: new Date().toISOString() },
      });
    }, 2000);
  }
  sendToRoom(room: string, data: any) {
    this.eventSubject.next({ room, data });
  }

  sendToUser(userId: string, data: any) {
    this.eventSubject.next({ userId, data });
  }

  sendToAll(data: any) {
    this.eventSubject.next({ data });
  }

  getEventStream(room?: string, userId?: string): Observable<any> {
    return this.eventSubject.asObservable().pipe(
      filter((event) => {
        if (room && event.room !== room) return false;
        if (userId && event.userId !== userId) return false;
        return true;
      }),
    );
  }
}
