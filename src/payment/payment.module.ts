import { forwardRef, Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { SecretModule } from 'src/secret/secret.module';
import { FieldModule } from 'src/field/field.module';
import { PlayerModule } from 'src/player/player.module';
import { TimerModule } from 'src/timer/timers.module';
import { GameModule } from 'src/game/game.module';

@Module({
  imports: [
    forwardRef(() => SecretModule),
    FieldModule,
    PlayerModule,
    TimerModule,
    forwardRef(() => GameModule),
  ],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
