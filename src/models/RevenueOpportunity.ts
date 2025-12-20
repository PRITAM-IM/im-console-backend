import mongoose, { Document, Schema } from 'mongoose';

export interface IRevenueOpportunity extends Document {
    projectId: mongoose.Types.ObjectId;
    eventId: string;
    eventName: string;
    eventType: 'concert' | 'festival' | 'sports' | 'conference' | 'holiday' | 'other';
    description: string;
    startDate: Date;
    endDate: Date;
    location: {
        address: string;
        city: string;
        state?: string;
        country: string;
        latitude?: number;
        longitude?: number;
    };
    distanceFromHotel: number;
    expectedAttendance?: number;
    aiInsights?: {
        revenueOpportunity: string;
        estimatedRoomDemand: number;
        recommendedCampaignStart: Date;
        suggestedActions: string[];
        targetAudience: string;
        pricingStrategy: string;
        generatedAt: Date;
    };
    source: 'eventbrite' | 'serpapi' | 'openrouter' | 'manual';
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const RevenueOpportunitySchema = new Schema<IRevenueOpportunity>(
    {
        projectId: {
            type: Schema.Types.ObjectId,
            ref: 'Project',
            required: true,
            index: true,
        },
        eventId: {
            type: String,
            required: true,
        },
        eventName: {
            type: String,
            required: true,
        },
        eventType: {
            type: String,
            enum: ['concert', 'festival', 'sports', 'conference', 'holiday', 'other'],
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
        startDate: {
            type: Date,
            required: true,
            index: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        location: {
            address: String,
            city: { type: String, required: true },
            state: String,
            country: { type: String, required: true },
            latitude: Number,
            longitude: Number,
        },
        distanceFromHotel: {
            type: Number,
            required: true,
        },
        expectedAttendance: Number,
        aiInsights: {
            revenueOpportunity: {
                type: String,
                enum: ['High', 'Medium', 'Low'],
            },
            estimatedRoomDemand: Number,
            recommendedCampaignStart: Date,
            suggestedActions: [String],
            targetAudience: String,
            pricingStrategy: String,
            generatedAt: Date,
        },
        source: {
            type: String,
            enum: ['eventbrite', 'serpapi', 'openrouter', 'manual'],
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

RevenueOpportunitySchema.index({ projectId: 1, startDate: 1 });
RevenueOpportunitySchema.index({ projectId: 1, isActive: 1, startDate: 1 });

export const RevenueOpportunity = mongoose.model<IRevenueOpportunity>(
    'RevenueOpportunity',
    RevenueOpportunitySchema
);
