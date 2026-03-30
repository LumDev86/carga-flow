import { IsNumber, IsArray, IsOptional, IsString, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CatacTariffEntryDto {
  @ApiProperty({ description: 'Distancia en km', example: 100 })
  @IsNumber()
  @Min(1)
  km: number;

  @ApiProperty({ description: 'Tarifa total del viaje para esa distancia', example: 24176 })
  @IsNumber()
  @Min(0)
  tariffTotal: number;
}

export class ImportCatacDto {
  @ApiProperty({ type: [CatacTariffEntryDto], description: 'Lista de tarifas km -> tarifa total' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatacTariffEntryDto)
  entries: CatacTariffEntryDto[];

  @ApiPropertyOptional({ description: 'Versión de la tabla', example: 'CATAC-ENE-2026' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({ description: 'Fecha de vigencia (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  validFrom?: string;
}
