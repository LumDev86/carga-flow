import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreatePortUserDto {
  @ApiProperty({ example: 'puerto@terminal6.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Admin' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Terminal 6' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '+5493416000000' })
  @IsString()
  @IsNotEmpty()
  phone: string;
}
