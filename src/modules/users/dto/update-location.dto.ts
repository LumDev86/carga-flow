import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateLocationDto {
  @ApiProperty({
    description: 'Latitud de la ubicación del usuario',
    example: -34.6037,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({
    description: 'Longitud de la ubicación del usuario',
    example: -58.3816,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({
    description: 'Dirección formateada de la ubicación',
    example: 'Av. Corrientes 1234, Buenos Aires, Argentina',
    required: false,
  })
  @IsOptional()
  @IsString()
  address?: string;
}
