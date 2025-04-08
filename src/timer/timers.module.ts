import { Module } from '@nestjs/common';
import { TimerService } from './timers.service';

@Module({
  providers: [TimerService],
  exports: [TimerService],
})
export class TimerModule {}
