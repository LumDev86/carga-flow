import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FuelType } from '../../../shared/enums/fuel-type.enum';
import { FuelSource } from '../../../shared/enums/fuel-source.enum';

export class RegisterFuelPriceDto {
  @ApiProperty({ enum: FuelType, example: FuelType.COMUN })
  @IsEnum(FuelType)
  fuelType: FuelType;

  @ApiProperty({ example: 1950.0, description: 'AR$ por litro' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  pricePerLiter: number;

  @ApiPropertyOptional({
    example: '2026-04-17T14:00:00-03:00',
    description: 'Si se omite, usa now(). Max 24h futuro, 7 días pasado.',
  })
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @ApiPropertyOptional({
    enum: FuelSource,
    default: FuelSource.MANUAL_ADMIN,
  })
  @IsOptional()
  @IsEnum(FuelSource)
  source?: FuelSource;

  @ApiPropertyOptional({ example: 'Resolución YPF #123 del 2026-04-15' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceRef?: string;

  @ApiPropertyOptional({ example: 'Ajuste semanal según surtidor' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
