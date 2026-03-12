import { IsNumber, IsPositive, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmFleteReceivedDto {
  @ApiProperty({
    description: 'Monto del flete recibido del puerto (si difiere del precio calculado)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  fleteAmount?: number;

  @ApiProperty({ description: 'Nota del admin', required: false })
  @IsOptional()
  @IsString()
  adminNote?: string;
}
