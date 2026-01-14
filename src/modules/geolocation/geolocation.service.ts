import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
}

export interface GeocodeResult {
  coordinates: {
    latitude: number;
    longitude: number;
  };
  address: {
    formattedAddress: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };
}

@Injectable()
export class GeolocationService {
  private readonly googleMapsApiKey: string;

  constructor(private configService: ConfigService) {
    this.googleMapsApiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY') || '';
  }

  /**
   * Obtiene sugerencias de direcciones usando Google Places Autocomplete
   * @param input - Texto ingresado por el usuario
   * @param country - Código de país para filtrar resultados (opcional)
   * @returns Lista de sugerencias de direcciones
   */
  async getPlaceAutocomplete(
    input: string,
    country?: string,
  ): Promise<PlaceSuggestion[]> {
    try {
      const encodedInput = encodeURIComponent(input);
      let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodedInput}&key=${this.googleMapsApiKey}&language=es`;

      // Filtrar por país si se especifica
      if (country) {
        url += `&components=country:${country}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      console.log('Google Places API response status:', data.status);

      if (data.status === 'OK' && data.predictions) {
        return data.predictions.map((prediction: any) => ({
          placeId: prediction.place_id,
          description: prediction.description,
          mainText: prediction.structured_formatting?.main_text,
          secondaryText: prediction.structured_formatting?.secondary_text,
        }));
      }

      if (data.status === 'ZERO_RESULTS') {
        return [];
      }

      // Log detallado del error para debugging
      console.error('Google Places API error:', {
        status: data.status,
        error_message: data.error_message,
        apiKeyConfigured: !!this.googleMapsApiKey,
        apiKeyLength: this.googleMapsApiKey?.length || 0,
      });
      return [];
    } catch (error) {
      console.error('Error en autocomplete:', error);
      return [];
    }
  }

  /**
   * Obtiene los detalles de un lugar usando su Place ID
   * @param placeId - ID del lugar de Google Places
   * @returns Coordenadas y dirección del lugar
   */
  async getPlaceDetails(placeId: string): Promise<GeocodeResult | null> {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${this.googleMapsApiKey}&language=es&fields=geometry,formatted_address,address_components`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.result) {
        const result = data.result;
        const location = result.geometry.location;
        const addressComponents = result.address_components || [];

        const address: GeocodeResult['address'] = {
          formattedAddress: result.formatted_address,
        };

        addressComponents.forEach((component: any) => {
          if (component.types.includes('route')) {
            address.street = component.long_name;
          }
          if (component.types.includes('locality')) {
            address.city = component.long_name;
          }
          if (component.types.includes('administrative_area_level_1')) {
            address.state = component.long_name;
          }
          if (component.types.includes('country')) {
            address.country = component.long_name;
          }
          if (component.types.includes('postal_code')) {
            address.postalCode = component.long_name;
          }
        });

        return {
          coordinates: {
            latitude: location.lat,
            longitude: location.lng,
          },
          address,
        };
      }

      return null;
    } catch (error) {
      console.error('Error obteniendo detalles del lugar:', error);
      return null;
    }
  }

  /**
   * Geocodifica una dirección de texto a coordenadas
   * @param address - Dirección a geocodificar
   * @returns Coordenadas y dirección formateada
   */
  async geocodeAddress(address: string): Promise<GeocodeResult | null> {
    try {
      const encodedAddress = encodeURIComponent(address);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${this.googleMapsApiKey}&language=es`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        const result = data.results[0];
        const location = result.geometry.location;
        const addressComponents = result.address_components;

        const addressResult: GeocodeResult['address'] = {
          formattedAddress: result.formatted_address,
        };

        addressComponents.forEach((component: any) => {
          if (component.types.includes('route')) {
            addressResult.street = component.long_name;
          }
          if (component.types.includes('locality')) {
            addressResult.city = component.long_name;
          }
          if (component.types.includes('administrative_area_level_1')) {
            addressResult.state = component.long_name;
          }
          if (component.types.includes('country')) {
            addressResult.country = component.long_name;
          }
          if (component.types.includes('postal_code')) {
            addressResult.postalCode = component.long_name;
          }
        });

        return {
          coordinates: {
            latitude: location.lat,
            longitude: location.lng,
          },
          address: addressResult,
        };
      }

      return null;
    } catch (error) {
      console.error('Error en geocodificación:', error);
      return null;
    }
  }
}
