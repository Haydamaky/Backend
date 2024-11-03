import { IsUUID } from 'class-validator';

export class CreatePlayerDto {
  @IsUUID()
  gameId: string;
  @IsUUID()
  userId: string;
}
