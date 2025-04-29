import { forwardRef, Module } from '@nestjs/common';
import { FieldModule } from 'src/field/field.module';
import { PlayerGateway } from './player.gateway';
import { PlayerRepository } from './player.repository';
import { PlayerService } from './player.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
@Module({
  imports: [FieldModule, JwtModule, ConfigModule],
  providers: [PlayerGateway, PlayerService, PlayerRepository],
  exports: [PlayerService],
})
export class PlayerModule {}
