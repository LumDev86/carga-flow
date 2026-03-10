import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreatePortDto } from './create-port.dto';

export class UpdatePortDto extends PartialType(CreatePortDto) {
  @ApiPropertyOptional({ description: 'Puerto activo/inactivo' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
