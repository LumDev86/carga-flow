import {
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsDateString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CargoType } from '../../../shared/enums/cargo-type.enum';
import { TransportType } from '../../../shared/enums/transport-type.enum';

export class LocationDto {
  @ApiProperty({ example: -32.9 })
  @IsNumber()
  lat: number;

  @ApiProperty({ example: -60.7 })
  @IsNumber()
  lng: number;

  @ApiPropertyOptional({ example: 'Rosario' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Santa Fe' })
  @IsOptional()
  @IsString()
  state?: string;
}

export class CreateQuoteDto {
  @ApiProperty({ type: LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  origin: LocationDto;

  @ApiProperty({ type: LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  destination: LocationDto;

  @ApiPropertyOptional({ description: 'Distancia en km (si no se envía, se calcula por Haversine)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  distanceKm?: number;

  @ApiPropertyOptional({ enum: CargoType })
  @IsOptional()
  @IsEnum(CargoType)
  cargoType?: CargoType;

  @ApiPropertyOptional({ enum: TransportType })
  @IsOptional()
  @IsEnum(TransportType)
  transportType?: TransportType;

  @ApiPropertyOptional({ description: 'Peso en kg' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  weightKg?: number;

  @ApiPropertyOptional({ description: 'Tipo de grano', example: 'SOJA' })
  @IsOptional()
  @IsString()
  grainType?: string;

  @ApiPropertyOptional({ description: 'Fecha/hora de carga (para cálculo de urgencia)' })
  @IsOptional()
  @IsDateString()
  loadDatetime?: string;

  @ApiPropertyOptional({ description: 'Si es oportunidad de retorno desde puerto', default: false })
  @IsOptional()
  @IsBoolean()
  isPortReturn?: boolean;

  @ApiPropertyOptional({ description: 'Peajes estimados en pesos', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tollsEstimated?: number;
}
