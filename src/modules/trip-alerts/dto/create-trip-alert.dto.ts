import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TripAlertType,
  TripAlertPriority,
} from '../../../shared/enums/trip-alert.enum';

export class CreateTripAlertDto {
  @ApiProperty({ description: 'ID del trip al que pertenece la alerta' })
  @IsUUID()
  tripId: string;

  @ApiProperty({ enum: TripAlertType, description: 'Tipo de alerta' })
  @IsEnum(TripAlertType)
  type: TripAlertType;

  @ApiPropertyOptional({
    enum: TripAlertPriority,
    default: TripAlertPriority.NORMAL,
    description: 'Nivel de prioridad. Urgentes disparan sonido y vibración en el mobile.',
  })
  @IsOptional()
  @IsEnum(TripAlertPriority)
  priority?: TripAlertPriority;

  @ApiPropertyOptional({ description: 'Mensaje adicional, hasta 1000 caracteres' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
