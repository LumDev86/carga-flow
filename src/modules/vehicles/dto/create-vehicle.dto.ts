import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  Max,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransportType } from '../../../shared/enums/transport-type.enum';

export class CreateVehicleDto {
  @ApiProperty({ example: 'AB 123 CD' })
  @IsString()
  @Length(2, 20)
  plate: string;

  @ApiProperty({ enum: TransportType, example: TransportType.CAMION })
  @IsEnum(TransportType)
  type: TransportType;

  @ApiProperty({ example: 'Scania' })
  @IsString()
  @Length(1, 50)
  brand: string;

  @ApiProperty({ example: 'R500' })
  @IsString()
  @Length(1, 50)
  model: string;

  @ApiProperty({ example: 2020 })
  @IsNumber()
  @Min(1980)
  @Max(2030)
  year: number;

  @ApiPropertyOptional({ example: 'Blanco' })
  @IsOptional()
  @IsString()
  @Length(1, 30)
  color?: string;

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxWeightKg?: number;
}
