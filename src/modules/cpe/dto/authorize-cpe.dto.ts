import { IsOptional, IsNumber, IsString, Length, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AuthorizeCpeDto {
  @ApiPropertyOptional({ description: 'Sucursal AFIP (default 1)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  sucursal?: number;

  @ApiPropertyOptional({ description: 'Peso bruto en kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pesoBruto?: number;

  @ApiPropertyOptional({ description: 'Peso tara en kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pesoTara?: number;

  @ApiPropertyOptional({ description: 'Peso neto en kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pesoNeto?: number;

  @ApiPropertyOptional({ description: 'Patente del acoplado (override)' })
  @IsOptional()
  @IsString()
  @Length(2, 20)
  trailerPlate?: string;
}
