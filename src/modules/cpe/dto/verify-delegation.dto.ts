import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyDelegationDto {
  @ApiProperty({ description: 'CUIT del delegante (ej: 20-12345678-9)', example: '20-12345678-9' })
  @IsString()
  @Length(11, 13)
  cuit: string;
}
