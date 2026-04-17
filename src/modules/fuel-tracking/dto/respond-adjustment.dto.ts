import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class AcceptAdjustmentDto {
  @ApiPropertyOptional({ example: 'OK, entiendo el cambio' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectAdjustmentDto {
  @ApiProperty({ example: 'No estoy de acuerdo con el ajuste propuesto' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
