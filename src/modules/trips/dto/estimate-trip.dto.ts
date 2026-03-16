import { IsNumber, IsOptional, IsEnum, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransportType } from '../../../shared/enums/transport-type.enum';
import { CargoType } from '../../../shared/enums/cargo-type.enum';

export class EstimateTripDto {
  @ApiProperty()
  @IsNumber()
  originLat: number;

  @ApiProperty()
  @IsNumber()
  originLng: number;

  @ApiProperty()
  @IsNumber()
  destinationLat: number;

  @ApiProperty()
  @IsNumber()
  destinationLng: number;

  @ApiPropertyOptional({ enum: CargoType })
  @IsOptional()
  @IsEnum(CargoType)
  cargoType?: CargoType;

  @ApiPropertyOptional({ enum: TransportType })
  @IsOptional()
  @IsEnum(TransportType)
  transportType?: TransportType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  cargoWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cargoWeightUnit?: string;
}
