import { IsNumber, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StartTripDto {
  @ApiPropertyOptional({ example: -32.9468, description: 'Latitud GPS actual del conductor' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: -60.6393, description: 'Longitud GPS actual del conductor' })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
