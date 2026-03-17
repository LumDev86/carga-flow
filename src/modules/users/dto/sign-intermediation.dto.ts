import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SignIntermediationDto {
  @ApiProperty({ example: 'Agropecuaria San Martin S.A.', description: 'Razón social' })
  @IsString()
  @IsNotEmpty({ message: 'La razón social es requerida' })
  @MaxLength(255)
  companyName: string;

  @ApiProperty({ example: '30-12345678-9', description: 'CUIT de la empresa' })
  @IsString()
  @IsNotEmpty({ message: 'El CUIT es requerido' })
  @MaxLength(20)
  companyCuit: string;

  @ApiProperty({ example: 'Juan Pérez', description: 'Nombre del representante', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  representativeName?: string;

  @ApiProperty({ example: 'Gerente General', description: 'Cargo del representante', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  representativeRole?: string;
}
