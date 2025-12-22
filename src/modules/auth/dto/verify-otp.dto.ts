import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length, IsEnum } from 'class-validator';

export enum OtpType {
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
}

export class VerifyOtpDto {
  @ApiProperty({
    example: 'juan.perez@example.com',
    description: 'Email del usuario',
  })
  @IsEmail({}, { message: 'Debe proporcionar un email válido' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Código OTP de 6 dígitos',
  })
  @IsString()
  @Length(6, 6, { message: 'El código debe tener 6 dígitos' })
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: 'EMAIL',
    description: 'Tipo de verificación',
    enum: OtpType,
  })
  @IsEnum(OtpType)
  @IsNotEmpty()
  type: OtpType;
}
