import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SignAuthorizationDto {
  @ApiProperty()
  @IsString()
  companyName: string;

  @ApiProperty()
  @IsString()
  companyCuit: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representativeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representativeRole?: string;
}
