import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsHexColor,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserStatus } from '../../../generated/prisma/enums';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  dept?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsHexColor()
  avatarColor?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  statusMessage?: string;

  @IsOptional()
  @IsString()
  workStart?: string;

  @IsOptional()
  @IsString()
  workEnd?: string;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @IsOptional()
  @IsNumber()
  leaveBalance?: number;
}
