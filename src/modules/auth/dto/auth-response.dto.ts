import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../shared/enums/user-role.enum';
import { UserStatus } from '../../../shared/enums/user-status.enum';

export class UserResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'juan.perez@example.com' })
  email: string;

  @ApiProperty({ example: 'Juan' })
  firstName: string;

  @ApiProperty({ example: 'Pérez' })
  lastName: string;

  @ApiProperty({ example: '+5491123456789' })
  phone: string;

  @ApiProperty({ enum: UserRole, example: 'CHOFER' })
  rol: UserRole;

  @ApiProperty({ enum: UserStatus, example: 'VERIFIED' })
  estado: UserStatus;

  @ApiProperty({ example: true })
  emailVerified: boolean;

  @ApiProperty({ example: false })
  phoneVerified: boolean;

  @ApiProperty({ example: '0.00' })
  walletBalance: string;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ example: false })
  hasAcceptedDeclaration: boolean;

  @ApiProperty({ example: false })
  hasSignedIntermediationAuth: boolean;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', nullable: true, description: 'ID del puerto asociado (solo para usuarios PUERTO)' })
  portId: string | null;

  @ApiProperty({ example: '2025-12-22T14:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2025-12-22T14:30:00.000Z' })
  updatedAt: Date;
}

export class AuthResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT access token (válido por 7 días)',
  })
  accessToken: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT refresh token (válido por 30 días)',
  })
  refreshToken: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
