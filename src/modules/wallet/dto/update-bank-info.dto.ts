import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBankInfoDto {
  @ApiProperty({ description: 'CBU (22 dígitos)', example: '0110599940000012345678', required: false })
  @IsOptional()
  @IsString()
  @Length(22, 22, { message: 'El CBU debe tener exactamente 22 dígitos' })
  @Matches(/^\d{22}$/, { message: 'El CBU debe contener solo números' })
  cbu?: string;

  @ApiProperty({ description: 'Alias bancario', example: 'mi.alias.mp', required: false })
  @IsOptional()
  @IsString()
  @Length(6, 50)
  bankAlias?: string;

  @ApiProperty({ description: 'Nombre del banco', example: 'Banco Nación', required: false })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({ description: 'Nombre del titular', example: 'Juan Pérez', required: false })
  @IsOptional()
  @IsString()
  bankHolderName?: string;
}
