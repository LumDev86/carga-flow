import { Controller, Get, ParseBoolPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { FuelType } from '../../../shared/enums/fuel-type.enum';
import { FuelPriceQueryService } from '../services/fuel-price-query.service';

/**
 * Read-only price info available to any authenticated user
 * (chofer, dador, puerto, admin). Used by:
 *  - Mobile app banner with current price
 *  - Port portal widget
 *  - Admin dashboard overview
 */
@ApiTags('fuel-prices-public')
@ApiBearerAuth('JWT-auth')
@Controller('fuel-prices')
@UseGuards(JwtAuthGuard)
export class PublicFuelPricesController {
  constructor(private readonly query: FuelPriceQueryService) {}

  @Get('current')
  @ApiOperation({ summary: 'Precio actual vigente + tendencia opcional' })
  @ApiQuery({ name: 'fuelType', required: false, enum: FuelType })
  @ApiQuery({ name: 'withTrend', required: false, type: Boolean })
  @ApiQuery({ name: 'trendDays', required: false, type: Number })
  async getCurrent(
    @Query('fuelType') fuelType: FuelType = FuelType.COMUN,
    @Query('withTrend') withTrendRaw?: string,
    @Query('trendDays') trendDaysRaw?: string,
  ) {
    const current = await this.query.getCurrent(fuelType);
    const withTrend = withTrendRaw === 'true' || withTrendRaw === '1';
    const trendDays = trendDaysRaw ? Math.min(90, Math.max(1, Number(trendDaysRaw))) : 7;

    const trend = withTrend ? await this.query.getTrend(fuelType, trendDays) : undefined;

    return { ...current, trend };
  }
}
