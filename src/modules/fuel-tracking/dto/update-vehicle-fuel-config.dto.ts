import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FuelType } from '../../../shared/enums/fuel-type.enum';

export class UpdateVehicleFuelConfigDto {
  @ApiPropertyOptional({ example: 34.5, description: 'L/100km' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(3)
  @Max(100)
  fuelConsumption?: number;

  @ApiPropertyOptional({ enum: FuelType })
  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;
}
