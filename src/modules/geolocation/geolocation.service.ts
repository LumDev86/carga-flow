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

export interface DirectionsResult {
  coordinates: Array<{ latitude: number; longitude: number }>;
  distance: number;
  duration: number;
  distanceText: string;
  durationText: string;
}

@Injectable()
export class GeolocationService {
  private readonly googleMapsApiKey: string;

  constructor(private configService: ConfigService) {
    this.googleMapsApiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY') || '';
  }

  /**
   * Decodifica un polyline encoded de Google Directions API
   */
  private decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
    const coordinates: Array<{ latitude: number; longitude: number }> = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let b: number;
      let shift = 0;
      let result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      coordinates.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return coordinates;
  }

  /**
   * Obtiene la ruta entre dos puntos usando Google Directions API
   * @param originLat - Latitud de origen
   * @param originLng - Longitud de origen
   * @param destLat - Latitud de destino
   * @param destLng - Longitud de destino
   * @returns Ruta con coordenadas, distancia y duración
   */
  async getDirections(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<DirectionsResult | null> {
    try {
      const originStr = `${originLat},${originLng}`;
      const destinationStr = `${destLat},${destLng}`;
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}&mode=driving&key=${this.googleMapsApiKey}&language=es`;

      console.log('📍 [Backend] Solicitando ruta a Google Directions API');

      const response = await fetch(url);
      const data = await response.json();

      console.log('📍 [Backend] Respuesta Directions API:', {
        status: data.status,
        routes: data.routes?.length,
      });

      if (data.status === 'OK' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];

        const encodedPolyline = route.overview_polyline?.points;

        if (!encodedPolyline) {
          console.error('❌ [Backend] No se encontró polyline en la respuesta');
          return null;
        }

        const coordinates = this.decodePolyline(encodedPolyline);

        console.log('📍 [Backend] Ruta decodificada:', {
          puntos: coordinates.length,
          distancia: leg.distance.text,
          duracion: leg.duration.text,
        });

        return {
          coordinates,
          distance: leg.distance.value / 1000,
          duration: leg.duration.value / 60,
          distanceText: leg.distance.text,
          durationText: leg.duration.text,
        };
      }

      console.error('❌ [Backend] Error en Directions API:', data.status, data.error_message);
      return null;
    } catch (error) {
      console.error('❌ [Backend] Error obteniendo direcciones:', error);
      return null;
    }
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

      console.error('Google Places API error:', data.status, data.error_message);
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
