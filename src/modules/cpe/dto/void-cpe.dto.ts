import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VoidCpeDto {
  @ApiProperty({ description: 'Motivo de anulación' })
  @IsString()
  @MinLength(5)
  reason: string;
}
