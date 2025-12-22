import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  rol: UserRole;
  estado: UserStatus;
  iat?: number;
  exp?: number;
}
