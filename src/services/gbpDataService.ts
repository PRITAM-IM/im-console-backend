import { googleBusinessProfileOauth2Client } from '../config/googleBusinessProfile';
import gbpAuthService from './gbpAuthService';

interface ReviewResponse {
  reviews?: any[];
}

export interface GBPReview {
  name: string; // Resource name
  reviewId: string;
  reviewer: {
    displayName: string;
    profilePhotoUrl?: string;
  };
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: {
    comment: string;
    updateTime: string;
  };
}

export interface GBPInsights {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    oneStar: number;
    twoStar: number;
    threeStar: number;
    fourStar: number;
    fiveStar: number;
  };
}

export interface IGbpDataService {
  getAccessToken(projectId: string): Promise<string>;
  getReviews(locationName: string, accessToken: string): Promise<GBPReview[]>;
  getInsights(locationName: string, accessToken: string): Promise<GBPInsights>;
}

class GbpDataService implements IGbpDataService {
  /**
   * Get access token for a project, refreshing if necessary
   */
  public async getAccessToken(projectId: string): Promise<string> {
    const connection = await gbpAuthService.getConnectionByProject(projectId);
    
    if (!connection) {
      throw new Error('Google Business Profile not connected for this project');
    }

    // Check if access token is still valid
    if (connection.accessToken && connection.expiresAt && connection.expiresAt > new Date()) {
      return connection.accessToken;
    }

    // Refresh access token
    const { accessToken, expiresAt } = await gbpAuthService.refreshAccessToken(connection.refreshToken);
    
    // Update connection with new access token
    connection.accessToken = accessToken;
    connection.expiresAt = expiresAt || undefined;
    await connection.save();

    return accessToken;
  }

  /**
   * Fetch reviews for a specific location
   */
  public async getReviews(locationName: string, accessToken: string): Promise<GBPReview[]> {
    try {
      const response = await fetch(
        `https://mybusiness.googleapis.com/v4/${locationName}/reviews`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch reviews: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as ReviewResponse;
      const reviews = data.reviews || [];

      return reviews.map((review: any) => ({
        name: review.name,
        reviewId: review.reviewId || review.name?.split('/').pop() || '',
        reviewer: {
          displayName: review.reviewer?.displayName || 'Anonymous',
          profilePhotoUrl: review.reviewer?.profilePhotoUrl,
        },
        starRating: review.starRating || 'FIVE',
        comment: review.comment,
        createTime: review.createTime,
        updateTime: review.updateTime,
        reviewReply: review.reviewReply ? {
          comment: review.reviewReply.comment,
          updateTime: review.reviewReply.updateTime,
        } : undefined,
      }));
    } catch (error: any) {
      console.error('[GBP Data Service] Error fetching reviews:', error.message);
      throw new Error(`Failed to fetch Google Business Profile reviews: ${error.message}`);
    }
  }

  /**
   * Calculate insights from reviews
   */
  public async getInsights(locationName: string, accessToken: string): Promise<GBPInsights> {
    try {
      const reviews = await this.getReviews(locationName, accessToken);

      const ratingDistribution = {
        oneStar: 0,
        twoStar: 0,
        threeStar: 0,
        fourStar: 0,
        fiveStar: 0,
      };

      let totalRating = 0;

      reviews.forEach((review) => {
        const rating = this.convertStarRatingToNumber(review.starRating);
        totalRating += rating;

        switch (review.starRating) {
          case 'ONE':
            ratingDistribution.oneStar++;
            break;
          case 'TWO':
            ratingDistribution.twoStar++;
            break;
          case 'THREE':
            ratingDistribution.threeStar++;
            break;
          case 'FOUR':
            ratingDistribution.fourStar++;
            break;
          case 'FIVE':
            ratingDistribution.fiveStar++;
            break;
        }
      });

      const averageRating = reviews.length > 0 ? totalRating / reviews.length : 0;

      return {
        totalReviews: reviews.length,
        averageRating: Number(averageRating.toFixed(2)),
        ratingDistribution,
      };
    } catch (error: any) {
      console.error('[GBP Data Service] Error calculating insights:', error.message);
      throw new Error(`Failed to calculate Google Business Profile insights: ${error.message}`);
    }
  }

  private convertStarRatingToNumber(starRating: string): number {
    switch (starRating) {
      case 'ONE':
        return 1;
      case 'TWO':
        return 2;
      case 'THREE':
        return 3;
      case 'FOUR':
        return 4;
      case 'FIVE':
        return 5;
      default:
        return 0;
    }
  }
}

export default new GbpDataService();

