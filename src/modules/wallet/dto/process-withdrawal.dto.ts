import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ProcessWithdrawalDto {
  @ApiProperty({ description: 'Referencia de la transferencia bancaria', required: false })
  @IsOptional()
  @IsString()
  transferReference?: string;

  @ApiProperty({ description: 'Nota del admin', required: false })
  @IsOptional()
  @IsString()
  adminNote?: string;
}

export class RejectWithdrawalDto {
  @ApiProperty({ description: 'Motivo de rechazo' })
  @IsString()
  reason: string;

  @ApiProperty({ description: 'Nota del admin', required: false })
  @IsOptional()
  @IsString()
  adminNote?: string;
}
