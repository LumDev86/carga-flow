import { IsNumber, IsArray, ValidateNested, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GrainTariffEntryDto {
  @ApiProperty({ description: 'Distancia en km' })
  @IsNumber()
  @Min(1)
  km: number;

  @ApiProperty({ description: 'Precio por tonelada en pesos' })
  @IsNumber()
  @Min(0)
  pricePerTon: number;
}

export class BulkGrainTariffDto {
  @ApiProperty({ type: [GrainTariffEntryDto], description: 'Lista de tarifas km → $/TN' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrainTariffEntryDto)
  entries: GrainTariffEntryDto[];
}

export class GrainPriceQueryDto {
  @ApiProperty({ description: 'Distancia en km' })
  @IsNumber()
  @Min(1)
  distanceKm: number;

  @ApiProperty({ description: 'Peso en toneladas' })
  @IsNumber()
  @Min(0.1)
  weightTon: number;

  @ApiPropertyOptional({ description: 'Tasa de comisión (override)' })
  @IsOptional()
  @IsNumber()
  commissionRate?: number;
}
