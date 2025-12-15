import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IProject extends Document {
  name: string;
  websiteUrl: string;
  gaPropertyId?: string;
  googleAdsCustomerId?: string;
  searchConsoleSiteUrl?: string;
  facebookPageId?: string;
  metaAdsAccountId?: string;
  youtubeChannelId?: string;
  googleSheetId?: string;
  googleDriveFolderId?: string;
  linkedinPageId?: string;
  googleBusinessProfileLocationId?: string;
  // Google Places API integration
  googlePlacesId?: string;
  googlePlacesData?: {
    displayName?: string;
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    websiteUri?: string;
    phoneNumber?: string;
    location?: {
      latitude: number;
      longitude: number;
    };
    lastUpdated?: Date;
  };
  instagram?: {
    igUserId?: string;
    igUsername?: string;
    pageId?: string;
    accessToken?: string;
    connectedAt?: Date;
  };
  // AI Analysis Cache
  overviewAnalysis?: string;
  overviewGeneratedAt?: Date;
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema: Schema<IProject> = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    websiteUrl: {
      type: String,
      required: true,
      trim: true,
    },
    gaPropertyId: {
      type: String,
      trim: true,
    },
    googleAdsCustomerId: {
      type: String,
      trim: true,
    },
    searchConsoleSiteUrl: {
      type: String,
      trim: true,
    },
    facebookPageId: {
      type: String,
      trim: true,
    },
    metaAdsAccountId: {
      type: String,
      trim: true,
    },
    youtubeChannelId: {
      type: String,
      trim: true,
    },
    googleSheetId: {
      type: String,
      trim: true,
    },
    googleDriveFolderId: {
      type: String,
      trim: true,
    },
    linkedinPageId: {
      type: String,
      trim: true,
    },
    googleBusinessProfileLocationId: {
      type: String,
      trim: true,
    },
    // Google Places API integration
    googlePlacesId: {
      type: String,
      trim: true,
    },
    googlePlacesData: {
      displayName: {
        type: String,
        trim: true,
      },
      formattedAddress: {
        type: String,
        trim: true,
      },
      rating: {
        type: Number,
      },
      userRatingCount: {
        type: Number,
      },
      websiteUri: {
        type: String,
        trim: true,
      },
      phoneNumber: {
        type: String,
        trim: true,
      },
      location: {
        latitude: {
          type: Number,
        },
        longitude: {
          type: Number,
        },
      },
      lastUpdated: {
        type: Date,
      },
    },
    instagram: {
      igUserId: {
        type: String,
        trim: true,
      },
      igUsername: {
        type: String,
        trim: true,
      },
      pageId: {
        type: String,
        trim: true,
      },
      accessToken: {
        type: String,
      },
      connectedAt: {
        type: Date,
      },
    },
    // AI Analysis Cache
    overviewAnalysis: {
      type: String,
    },
    overviewGeneratedAt: {
      type: Date,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Project: Model<IProject> = mongoose.model<IProject>('Project', projectSchema);

export default Project;