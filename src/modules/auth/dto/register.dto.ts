import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsEnum,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { UserRole } from '../../../shared/enums/user-role.enum';
import { AccountType } from '../../../shared/enums/account-type.enum';

export class RegisterDto {
  @ApiProperty({
    example: 'juan.perez@example.com',
    description: 'Email del usuario',
  })
  @IsEmail({}, { message: 'Debe proporcionar un email válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  email: string;

  @ApiProperty({
    example: 'SecureP@ss123',
    description: 'Contraseña (mín 8 caracteres, 1 mayúscula, 1 minúscula, 1 número)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
    {
      message: 'La contraseña debe contener al menos una mayúscula, una minúscula y un número'
    }
  )
  password: string;

  @ApiProperty({
    example: '+5491123456789',
    description: 'Teléfono con código de país (opcional)',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'El teléfono debe tener formato internacional válido'
  })
  phone?: string;

  @ApiProperty({
    example: 'Juan',
    description: 'Nombre del usuario',
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(50)
  firstName: string;

  @ApiProperty({
    example: 'Pérez',
    description: 'Apellido del usuario',
  })
  @IsString()
  @IsNotEmpty({ message: 'El apellido es requerido' })
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  @MaxLength(50)
  lastName: string;

  @ApiProperty({
    example: 'CHOFER || SOLICITANTE || PUERTO || ADMIN',
    description: 'Rol del usuario',
    enum: UserRole,
    default: UserRole.SOLICITANTE,
  })
  @IsEnum(UserRole, { message: 'Rol inválido' })
  @IsOptional()
  rol?: UserRole;

  @ApiProperty({
    example: 'EMPRESA || INDIVIDUO',
    description: 'Tipo de cuenta',
    enum: AccountType,
    default: AccountType.INDIVIDUO,
  })
  @IsEnum(AccountType, { message: 'Tipo de cuenta inválido' })
  @IsOptional()
  accountType?: AccountType;

  @ApiProperty({
    example: 'Transportes ABC S.A.',
    description: 'Nombre de la empresa (requerido si accountType es EMPRESA)',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  companyName?: string;

  @ApiProperty({
    example: '30-12345678-9',
    description: 'CUIT o DNI fiscal (requerido si accountType es EMPRESA)',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  companyTaxId?: string;

  @ApiProperty({
    example: 'Av. Corrientes 1234, Buenos Aires, Argentina',
    description: 'Dirección fiscal de la empresa',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  companyAddress?: string;

  // Campos específicos para transportistas
  @ApiProperty({
    example: '12345678',
    description: 'DNI del transportista (7-8 dígitos)',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  dni?: string;

  @ApiProperty({
    example: '20-12345678-9',
    description:
      'CUIT (11 dígitos). Opcional al registrarse — si se envía, se valida contra AFIP. Puede completarse después desde el perfil.',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{2}-?\d{8}-?\d{1}$|^\d{11}$/, {
    message: 'El CUIT debe tener 11 dígitos (con o sin guiones)',
  })
  @MaxLength(20)
  cuit?: string;

  @ApiProperty({
    example: true,
    description: 'Aceptación de la declaración jurada del dador de carga (6 puntos)',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  hasAcceptedDeclaration?: boolean;
}
