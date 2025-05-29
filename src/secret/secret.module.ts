import { forwardRef, Module } from '@nestjs/common';
import { SecretService } from './secret.service';
import { GameModule } from 'src/game/game.module';
import { PlayerModule } from 'src/player/player.module';
import { ChatModule } from 'src/chat/chat.module';
import { FieldModule } from 'src/field/field.module';
import { PaymentModule } from 'src/payment/payment.module';

@Module({
  imports: [
    forwardRef(() => GameModule),
    PlayerModule,
    ChatModule,
    FieldModule,
    forwardRef(() => PaymentModule),
  ],
  providers: [SecretService],
  exports: [SecretService],
})
export class SecretModule {}
