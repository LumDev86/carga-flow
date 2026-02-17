import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransportType } from '../../../shared/enums/transport-type.enum';
import { CargoType } from '../../../shared/enums/cargo-type.enum';

export class CreateTripDto {
  // --- Origen ---
  @ApiProperty()
  @IsString()
  originAddress: string;

  @ApiProperty()
  @IsNumber()
  originLat: number;

  @ApiProperty()
  @IsNumber()
  originLng: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originState?: string;

  // --- Destino ---
  @ApiProperty()
  @IsString()
  destinationAddress: string;

  @ApiProperty()
  @IsNumber()
  destinationLat: number;

  @ApiProperty()
  @IsNumber()
  destinationLng: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destinationCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destinationState?: string;

  // --- Carga ---
  @ApiProperty()
  @IsString()
  cargoDescription: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  cargoPallets?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cargoFragile?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cargoInstructions?: string;

  // --- Schedule ---
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledPickupAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  estimatedDeliveryAt?: string;
}
