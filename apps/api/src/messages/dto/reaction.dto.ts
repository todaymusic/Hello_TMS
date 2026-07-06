import { IsString } from 'class-validator';

export class ReactionDto {
  @IsString()
  userId!: string;

  @IsString()
  emoji!: string;
}
