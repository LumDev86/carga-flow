import { IsNumber, IsPositive, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWithdrawalDto {
  @ApiProperty({ description: 'Monto a retirar', example: 50000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Nota opcional del conductor', required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
