import {
  IsEmail,
  IsOptional,
  IsString,
  IsStrongPassword,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsStrongPassword({ minLength: 6, minNumbers: 1 })
  password?: string;

  @IsString()
  @MinLength(4)
  @MaxLength(16)
  @IsOptional()
  nickname?: string;
}
