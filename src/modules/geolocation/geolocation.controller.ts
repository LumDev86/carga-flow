import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { GeolocationService, PlaceSuggestion, GeocodeResult } from './geolocation.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Geolocation')
@Controller('geolocation')
export class GeolocationController {
  constructor(private readonly geolocationService: GeolocationService) {}

  @Public()
  @Get('autocomplete')
  @ApiOperation({ summary: 'Obtener sugerencias de direcciones (autocomplete)' })
  @ApiQuery({ name: 'input', required: true, description: 'Texto de búsqueda' })
  @ApiQuery({ name: 'country', required: false, description: 'Código de país (ej: ar, mx, es)' })
  @ApiResponse({ status: 200, description: 'Lista de sugerencias de direcciones' })
  @ApiResponse({ status: 400, description: 'Input requerido' })
  async getAutocomplete(
    @Query('input') input: string,
    @Query('country') country?: string,
  ): Promise<PlaceSuggestion[]> {
    if (!input || input.trim().length < 2) {
      throw new BadRequestException('El texto de búsqueda debe tener al menos 2 caracteres');
    }

    return this.geolocationService.getPlaceAutocomplete(input.trim(), country);
  }

  @Public()
  @Get('place-details')
  @ApiOperation({ summary: 'Obtener detalles de un lugar por su Place ID' })
  @ApiQuery({ name: 'placeId', required: true, description: 'ID del lugar de Google Places' })
  @ApiResponse({ status: 200, description: 'Detalles del lugar con coordenadas' })
  @ApiResponse({ status: 400, description: 'Place ID requerido' })
  async getPlaceDetails(
    @Query('placeId') placeId: string,
  ): Promise<GeocodeResult | null> {
    if (!placeId || placeId.trim().length === 0) {
      throw new BadRequestException('El Place ID es requerido');
    }

    return this.geolocationService.getPlaceDetails(placeId.trim());
  }

  @Public()
  @Get('geocode')
  @ApiOperation({ summary: 'Geocodificar una dirección a coordenadas' })
  @ApiQuery({ name: 'address', required: true, description: 'Dirección a geocodificar' })
  @ApiResponse({ status: 200, description: 'Coordenadas y dirección formateada' })
  @ApiResponse({ status: 400, description: 'Dirección requerida' })
  async geocodeAddress(
    @Query('address') address: string,
  ): Promise<GeocodeResult | null> {
    if (!address || address.trim().length === 0) {
      throw new BadRequestException('La dirección es requerida');
    }

    return this.geolocationService.geocodeAddress(address.trim());
  }
}
