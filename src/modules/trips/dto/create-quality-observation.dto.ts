import { IsEnum, IsString, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QualityParameter } from '../entities/quality-observation.entity';

export class QualityObservationEntryDto {
  @ApiProperty({ enum: QualityParameter, example: QualityParameter.HUMEDAD })
  @IsEnum(QualityParameter)
  parameter: QualityParameter;

  @ApiProperty({ description: 'Valor observado', example: '11.90' })
  @IsString()
  observedValue: string;

  @ApiPropertyOptional({ description: 'Descuento en kg', example: 0 })
  @IsOptional()
  @IsNumber()
  discountKg?: number;

  @ApiPropertyOptional({ description: 'Requiere reacondicionamiento', default: false })
  @IsOptional()
  @IsBoolean()
  requiresReconditioning?: boolean;

  @ApiPropertyOptional({ description: 'Enviar a cámara', default: false })
  @IsOptional()
  @IsBoolean()
  toChamber?: boolean;

  @ApiPropertyOptional({ description: 'Notas adicionales' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateQualityObservationsDto {
  @ApiProperty({ type: [QualityObservationEntryDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos una observación de calidad' })
  @ValidateNested({ each: true })
  @Type(() => QualityObservationEntryDto)
  observations: QualityObservationEntryDto[];
}
