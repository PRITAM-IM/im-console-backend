import { ENV } from '../config/env';

/**
 * Google Places API Service
 * Uses the new Places API (v1) to search for hotels and fetch place details
 * Documentation: https://developers.google.com/maps/documentation/places/web-service/
 */

export interface PlaceSearchResult {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  websiteUri?: string;
  internationalPhoneNumber?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface PlaceDetails {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  websiteUri?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  currentOpeningHours?: any;
  businessStatus?: string;
  priceLevel?: string;
  photos?: Array<{
    name: string;
    widthPx: number;
    heightPx: number;
  }>;
  reviews?: PlaceReview[];
  editorialSummary?: string;
  types?: string[];
}

export interface PlaceReview {
  name: string;
  relativePublishTimeDescription: string;
  rating: number;
  text?: {
    text: string;
    languageCode: string;
  };
  originalText?: {
    text: string;
    languageCode: string;
  };
  authorAttribution?: {
    displayName: string;
    uri: string;
    photoUri?: string;
  };
  publishTime?: string;
}

export interface IPlacesService {
  searchPlaces(query: string, location?: { lat: number; lng: number }): Promise<PlaceSearchResult[]>;
  getPlaceDetails(placeId: string): Promise<PlaceDetails>;
  getPlaceReviews(placeId: string): Promise<PlaceReview[]>;
  getPhotoUrl(photoName: string, maxWidth?: number): string;
}

class GooglePlacesService implements IPlacesService {
  private apiKey: string;
  private baseUrl = 'https://places.googleapis.com/v1';

  constructor() {
    this.apiKey = ENV.GOOGLE_PLACES_API_KEY;
    if (!this.apiKey) {
      console.warn('[Google Places Service] ⚠️ API key not configured!');
    } else {
      console.log('[Google Places Service] ✅ API key loaded (length:', this.apiKey.length, ', first 20 chars:', this.apiKey.substring(0, 20) + '...)');
    }
  }

  /**
   * Search for places (hotels) using Text Search
   */
  public async searchPlaces(query: string, location?: { lat: number; lng: number }): Promise<PlaceSearchResult[]> {
    try {
      const requestBody: any = {
        textQuery: query,
        languageCode: 'en',
        maxResultCount: 10,
      };

      // Add location bias if provided
      if (location) {
        requestBody.locationBias = {
          circle: {
            center: {
              latitude: location.lat,
              longitude: location.lng,
            },
            radius: 50000.0, // 50km radius
          },
        };
      }

      const response = await fetch(`${this.baseUrl}/places:searchText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.primaryType,places.websiteUri,places.internationalPhoneNumber,places.location',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Google Places API Error]');
        console.error('  Status:', response.status, response.statusText);
        console.error('  Response:', errorText);
        console.error('  API Key (first 20 chars):', this.apiKey?.substring(0, 20) + '...');

        // Parse the error for better messaging
        try {
          const errorJson = JSON.parse(errorText);
          const errorMessage = errorJson.error?.message || errorJson.error?.status || response.statusText;
          throw new Error(`Places API error: ${errorMessage}`);
        } catch {
          throw new Error(`Places API search failed: ${response.statusText} - ${errorText}`);
        }
      }

      const data = await response.json() as any;
      const places = data.places || [];

      return places.map((place: any) => ({
        placeId: place.id,
        displayName: place.displayName?.text || '',
        formattedAddress: place.formattedAddress || '',
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        primaryType: place.primaryType,
        websiteUri: place.websiteUri,
        internationalPhoneNumber: place.internationalPhoneNumber,
        location: place.location ? {
          latitude: place.location.latitude,
          longitude: place.location.longitude,
        } : undefined,
      }));
    } catch (error: any) {
      console.error('[Google Places Service] Search error:', error.message);
      throw new Error(`Failed to search places: ${error.message}`);
    }
  }

  /**
   * Get detailed information about a specific place
   */
  public async getPlaceDetails(placeId: string): Promise<PlaceDetails> {
    try {
      const fieldMask = [
        'id',
        'displayName',
        'formattedAddress',
        'rating',
        'userRatingCount',
        'primaryType',
        'websiteUri',
        'internationalPhoneNumber',
        'nationalPhoneNumber',
        'location',
        'currentOpeningHours',
        'businessStatus',
        'priceLevel',
        'photos',
        'reviews',
        'editorialSummary',
        'types',
      ].join(',');

      const response = await fetch(`${this.baseUrl}/places/${placeId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Places API details failed: ${response.statusText} - ${errorText}`);
      }

      const place = await response.json() as any;

      return {
        placeId: place.id,
        displayName: place.displayName?.text || '',
        formattedAddress: place.formattedAddress || '',
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        primaryType: place.primaryType,
        websiteUri: place.websiteUri,
        internationalPhoneNumber: place.internationalPhoneNumber,
        nationalPhoneNumber: place.nationalPhoneNumber,
        location: place.location ? {
          latitude: place.location.latitude,
          longitude: place.location.longitude,
        } : undefined,
        currentOpeningHours: place.currentOpeningHours,
        businessStatus: place.businessStatus,
        priceLevel: place.priceLevel,
        photos: place.photos?.slice(0, 10).map((photo: any) => ({
          name: photo.name,
          widthPx: photo.widthPx,
          heightPx: photo.heightPx,
        })),
        reviews: place.reviews?.map((review: any) => ({
          name: review.name,
          relativePublishTimeDescription: review.relativePublishTimeDescription,
          rating: review.rating,
          text: review.text,
          originalText: review.originalText,
          authorAttribution: review.authorAttribution,
          publishTime: review.publishTime,
        })),
        editorialSummary: place.editorialSummary?.text,
        types: place.types,
      };
    } catch (error: any) {
      console.error('[Google Places Service] Get details error:', error.message);
      throw new Error(`Failed to get place details: ${error.message}`);
    }
  }

  /**
   * Get reviews for a specific place
   */
  public async getPlaceReviews(placeId: string): Promise<PlaceReview[]> {
    try {
      const response = await fetch(`${this.baseUrl}/places/${placeId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'reviews',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Places API reviews failed: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as any;
      const reviews = data.reviews || [];

      return reviews.map((review: any) => ({
        name: review.name,
        relativePublishTimeDescription: review.relativePublishTimeDescription,
        rating: review.rating,
        text: review.text,
        originalText: review.originalText,
        authorAttribution: review.authorAttribution,
        publishTime: review.publishTime,
      }));
    } catch (error: any) {
      console.error('[Google Places Service] Get reviews error:', error.message);
      throw new Error(`Failed to get place reviews: ${error.message}`);
    }
  }

  /**
   * Generate URL for place photo
   */
  public getPhotoUrl(photoName: string, maxWidth: number = 800): string {
    // Photo name format: places/{placeId}/photos/{photoReference}
    return `${this.baseUrl}/${photoName}/media?maxWidthPx=${maxWidth}&key=${this.apiKey}`;
  }

  /**
   * Fetch photo as base64 data URL for client display
   */
  public async getPhotoData(photoName: string, maxWidth: number = 800): Promise<string> {
    try {
      const url = this.getPhotoUrl(photoName, maxWidth);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch photo: ${response.statusText}`);
      }

      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      return `data:${contentType};base64,${base64}`;
    } catch (error: any) {
      console.error('[Google Places Service] Get photo error:', error.message);
      throw new Error(`Failed to fetch photo: ${error.message}`);
    }
  }
}

export default new GooglePlacesService();
