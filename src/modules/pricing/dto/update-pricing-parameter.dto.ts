import { IsNumber, IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PricingCategory } from '../entities/pricing-parameter.entity';

export class UpdatePricingParameterDto {
  @ApiProperty({ description: 'Nuevo valor del parámetro' })
  @IsNumber()
  value: number;

  @ApiPropertyOptional({ description: 'Descripción del parámetro' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: PricingCategory })
  @IsOptional()
  @IsEnum(PricingCategory)
  category?: PricingCategory;

  @ApiPropertyOptional({ description: 'Fecha desde la cual aplica' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;
}

export class CreatePricingParameterDto {
  @ApiProperty({ description: 'Clave única del parámetro', example: 'gasoil_actual' })
  @IsString()
  key: string;

  @ApiProperty({ description: 'Valor numérico' })
  @IsNumber()
  value: number;

  @ApiPropertyOptional({ description: 'Descripción' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: PricingCategory })
  @IsEnum(PricingCategory)
  category: PricingCategory;

  @ApiPropertyOptional({ description: 'Fecha desde la cual aplica' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;
}
