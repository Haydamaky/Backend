import { IsUUID } from 'class-validator';

export class CreatePlayerDto {
  @IsUUID()
  id: string;
}
