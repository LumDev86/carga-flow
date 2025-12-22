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
} from 'class-validator';
import { UserRole } from '../../../shared/enums/user-role.enum';

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
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&#]{8,}$/,
    { 
      message: 'La contraseña debe contener al menos una mayúscula, una minúscula y un número' 
    }
  )
  password: string;

  @ApiProperty({
    example: '+5491123456789',
    description: 'Teléfono con código de país',
  })
  @IsString()
  @IsNotEmpty({ message: 'El teléfono es requerido' })
  @Matches(/^\+?[1-9]\d{1,14}$/, { 
    message: 'El teléfono debe tener formato internacional válido' 
  })
  phone: string;

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
    example: 'CHOFER',
    description: 'Rol del usuario',
    enum: UserRole,
    default: UserRole.SOLICITANTE,
  })
  @IsEnum(UserRole, { message: 'Rol inválido' })
  @IsOptional()
  rol?: UserRole;
}
