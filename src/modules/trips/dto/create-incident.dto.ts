import { IsEnum, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IncidentType } from '../../../shared/enums/incident-type.enum';

export class CreateIncidentDto {
  @ApiProperty({ enum: IncidentType, example: IncidentType.ROTURA })
  @IsEnum(IncidentType)
  type: IncidentType;

  @ApiProperty({ example: 'Se rompió la lona del acoplado durante la carga' })
  @IsString()
  @MinLength(10, { message: 'La descripción debe tener al menos 10 caracteres' })
  description: string;
}
