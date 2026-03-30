import { IsEnum, IsString, IsOptional, IsNumber, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentType, IncidentSeverity } from '../../../shared/enums/incident-type.enum';

export class CreateIncidentDto {
  @ApiProperty({ enum: IncidentType, example: IncidentType.ACCIDENTE })
  @IsEnum(IncidentType)
  type: IncidentType;

  @ApiProperty({ example: 'Se rompió la lona del acoplado durante la carga' })
  @IsString()
  @MinLength(10, { message: 'La descripción debe tener al menos 10 caracteres' })
  description: string;

  @ApiPropertyOptional({ enum: IncidentSeverity, default: IncidentSeverity.MEDIUM })
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @ApiPropertyOptional({ description: 'Latitud GPS (se captura automáticamente en app)' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitud GPS (se captura automáticamente en app)' })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
