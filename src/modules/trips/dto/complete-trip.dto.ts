import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteTripDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remitoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cargoPhotoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observations?: string;
}
