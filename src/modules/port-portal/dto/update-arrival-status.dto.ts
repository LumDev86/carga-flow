import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrivalStatus } from '../../../shared/enums/arrival-status.enum';

export class UpdateArrivalStatusDto {
  @ApiProperty({ enum: ArrivalStatus })
  @IsEnum(ArrivalStatus)
  arrivalStatus: ArrivalStatus;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.arrivalStatus === ArrivalStatus.DEMORADO || o.arrivalStatus === ArrivalStatus.RECHAZADO)
  @IsString()
  arrivalObservations?: string;
}
