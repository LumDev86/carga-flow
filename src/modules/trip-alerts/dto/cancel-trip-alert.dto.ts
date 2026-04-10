import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CancelTripAlertDto {
  @ApiPropertyOptional({ description: 'Motivo de la cancelación, hasta 500 caracteres' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
