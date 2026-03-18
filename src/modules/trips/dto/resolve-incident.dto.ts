import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ResolveIncidentDto {
  @ApiPropertyOptional({ example: 'Se contactó al chofer y se resolvió la situación' })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}
