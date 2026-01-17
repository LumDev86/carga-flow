import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { UserRole } from '../../../shared/enums/user-role.enum';
import { AccountType } from '../../../shared/enums/account-type.enum';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  @IsOptional()
  rol?: UserRole;

  @ApiProperty({ enum: AccountType, default: AccountType.INDIVIDUO })
  @IsEnum(AccountType)
  @IsOptional()
  accountType?: AccountType;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  companyName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  companyTaxId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  companyAddress?: string;

  // Campos específicos para transportistas
  @ApiProperty({ required: false, description: 'DNI del transportista (7-8 dígitos)' })
  @IsString()
  @IsOptional()
  dni?: string;

  @ApiProperty({ required: false, description: 'CUIT del transportista (11 dígitos)' })
  @IsString()
  @IsOptional()
  cuit?: string;
}
