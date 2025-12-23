import { Request, Response } from 'express';
import { RevenueOpportunity } from '../models/RevenueOpportunity';
import Project from '../models/Project';
import eventDiscoveryService from '../services/eventDiscoveryService';
import imageGenerationService from '../services/imageGenerationService';
import mongoose from 'mongoose';
import { IUser } from '../models/User';

// Extend Request to include user from auth middleware
interface AuthRequest extends Request {
    user?: IUser;
}

export const discoverOpportunities = async (req: AuthRequest, res: Response) => {
    try {
        const { projectId } = req.params;
        const userId = req.user?.id;

        // Verify project ownership
        const project = await Project.findOne({
            _id: new mongoose.Types.ObjectId(projectId),
            userId: new mongoose.Types.ObjectId(userId),
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found',
            });
        }

        // Get hotel location from Google Places
        let latitude: number | undefined;
        let longitude: number | undefined;
        let city: string;
        let hotelName = project.name;

        // Priority 1: Use Google Places data (most accurate)
        if (project.googlePlacesData?.location) {
            latitude = project.googlePlacesData.location.latitude;
            longitude = project.googlePlacesData.location.longitude;

            // Extract city from formatted address
            const addressParts = project.googlePlacesData.formattedAddress?.split(',') || [];
            if (addressParts.length >= 2) {
                // Usually format is: "Hotel Name, City, State, Country"
                city = addressParts[addressParts.length - 3]?.trim() || addressParts[1]?.trim() || project.name;
            } else {
                city = project.googlePlacesData.displayName || project.name;
            }

            hotelName = project.googlePlacesData.displayName || project.name;

            console.log(`✅ Using Google Places data:`);
            console.log(`   Hotel: ${hotelName}`);
            console.log(`   City: ${city}`);
            console.log(`   Coordinates: ${latitude}, ${longitude}`);
        }
        // Priority 2: Use manual location
        else if (project.manualLocation?.city) {
            city = project.manualLocation.city;
            latitude = project.manualLocation.latitude;
            longitude = project.manualLocation.longitude;
            console.log(`✅ Using manual location: ${city}${latitude && longitude ? ` (${latitude}, ${longitude})` : ''}`);
        }
        // Priority 3: Fallback to project name
        else {
            city = project.name;
            console.log(`⚠️  No location data available. Using project name as city: ${city}`);
            console.log(`💡 Tip: Connect Google Places for accurate location and better event discovery`);
        }

        console.log(`🔍 Discovering events for ${hotelName} in ${city}...`);

        // Clear old opportunities for this project before discovering new ones
        // This ensures we always show fresh data relevant to the current hotel connection
        const deletedCount = await RevenueOpportunity.deleteMany({
            projectId: project._id
        });
        console.log(`🗑️ Cleared ${deletedCount.deletedCount} old opportunities`);

        // Discover events using all available sources
        const events = await eventDiscoveryService.discoverEvents(
            city,
            hotelName,
            latitude,
            longitude,
            50 // 50km radius
        );

        console.log(`📊 Found ${events.length} events from all sources`);

        if (events.length === 0) {
            return res.json({
                success: true,
                message: 'No events found in your area. This could be due to: 1) No upcoming events in the next 90 days, 2) API rate limits, or 3) Location not recognized. Try connecting Google Places for better results.',
                data: [],
            });
        }

        // Save opportunities with AI insights
        // Limit to 10 events to avoid timeout in production (each AI call takes ~2-3s)
        const eventsToProcess = events.slice(0, 10);
        console.log(`📊 Processing ${eventsToProcess.length} events with AI insights...`);

        // Process events in parallel for faster response (batch of 3 at a time)
        const opportunities = [];
        const batchSize = 3;

        for (let i = 0; i < eventsToProcess.length; i += batchSize) {
            const batch = eventsToProcess.slice(i, i + batchSize);

            const batchResults = await Promise.all(
                batch.map(async (event) => {
                    try {
                        // Calculate distance only if we have valid coordinates
                        let distance = -1; // -1 indicates unknown
                        if (latitude && longitude && event.location.latitude && event.location.longitude) {
                            distance = eventDiscoveryService.calculateDistance(
                                latitude,
                                longitude,
                                event.location.latitude,
                                event.location.longitude
                            );
                        } else if (latitude && longitude) {
                            // Event has no coordinates, assume it's within reasonable distance from the searched city
                            distance = 25; // Default to 25km within the city
                        }

                        console.log(`💡 Generating AI insights for: ${event.name}`);

                        // Generate AI insights with timeout
                        const aiInsights = await Promise.race([
                            eventDiscoveryService.generateEventInsights(event, project.name, distance),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('AI timeout')), 10000)
                            )
                        ]).catch(() => ({
                            revenueOpportunity: distance < 20 ? 'High' : distance < 50 ? 'Medium' : 'Low',
                            estimatedRoomDemand: 10,
                            recommendedCampaignStart: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                            suggestedActions: ['Create targeted marketing campaign', 'Offer early booking discounts'],
                            targetAudience: 'Event attendees',
                            pricingStrategy: 'Adjust rates based on expected demand',
                        }));

                        return { event, distance, aiInsights };
                    } catch (error) {
                        console.error(`❌ Error processing event ${event.name}:`, error);
                        return null;
                    }
                })
            );

            // Save batch results to database
            for (const result of batchResults) {
                if (!result) continue;
                const { event, distance, aiInsights } = result as any;

                // Save to database
                const opportunity = await RevenueOpportunity.findOneAndUpdate(
                    {
                        projectId: project._id,
                        eventId: event.id,
                    },
                    {
                        projectId: project._id,
                        eventId: event.id,
                        eventName: event.name,
                        eventType: event.type,
                        description: event.description,
                        startDate: event.startDate,
                        endDate: event.endDate,
                        location: event.location,
                        distanceFromHotel: distance,
                        expectedAttendance: event.expectedAttendance,
                        aiInsights: {
                            ...aiInsights,
                            generatedAt: new Date(),
                        },
                        source: event.source,
                        isActive: true,
                    },
                    { upsert: true, new: true }
                );

                opportunities.push(opportunity);
            }
        }

        console.log(`✅ Saved ${opportunities.length} opportunities to database`);

        res.json({
            success: true,
            message: `Discovered ${opportunities.length} revenue opportunities`,
            data: opportunities,
        });
    } catch (error: any) {
        console.error('❌ Error discovering opportunities:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to discover opportunities',
            error: error.message,
        });
    }
};

/**
 * Get all revenue opportunities for a project
 */
export const getOpportunities = async (req: AuthRequest, res: Response) => {
    try {
        const { projectId } = req.params;
        const userId = req.user?.id;
        const { timeframe = 'upcoming', limit = 50 } = req.query;

        // Verify project ownership
        const project = await Project.findOne({
            _id: new mongoose.Types.ObjectId(projectId),
            userId: new mongoose.Types.ObjectId(userId),
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found',
            });
        }

        // Build query based on timeframe
        const query: any = {
            projectId: new mongoose.Types.ObjectId(projectId),
            isActive: true,
        };

        const now = new Date();
        if (timeframe === 'upcoming') {
            query.startDate = { $gte: now };
        } else if (timeframe === 'past') {
            query.startDate = { $lt: now };
        } else if (timeframe === 'next30days') {
            const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            query.startDate = { $gte: now, $lte: next30Days };
        } else if (timeframe === 'next90days') {
            const next90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
            query.startDate = { $gte: now, $lte: next90Days };
        }

        const opportunities = await RevenueOpportunity.find(query)
            .sort({ startDate: 1 })
            .limit(Number(limit));

        // Calculate statistics
        const stats = {
            total: opportunities.length,
            highOpportunity: opportunities.filter(
                (o) => o.aiInsights?.revenueOpportunity === 'High'
            ).length,
            mediumOpportunity: opportunities.filter(
                (o) => o.aiInsights?.revenueOpportunity === 'Medium'
            ).length,
            lowOpportunity: opportunities.filter(
                (o) => o.aiInsights?.revenueOpportunity === 'Low'
            ).length,
            totalEstimatedRoomDemand: opportunities.reduce(
                (sum, o) => sum + (o.aiInsights?.estimatedRoomDemand || 0),
                0
            ),
        };

        res.json({
            success: true,
            data: opportunities,
            stats,
        });
    } catch (error: any) {
        console.error('Error fetching opportunities:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch opportunities',
            error: error.message,
        });
    }
};

/**
 * Get a single opportunity with detailed insights
 */
export const getOpportunityDetails = async (req: AuthRequest, res: Response) => {
    try {
        const { opportunityId } = req.params;
        const userId = req.user?.id;

        const opportunity = await RevenueOpportunity.findById(opportunityId).populate('projectId');

        if (!opportunity) {
            return res.status(404).json({
                success: false,
                message: 'Opportunity not found',
            });
        }

        // Verify ownership
        const project = opportunity.projectId as any;
        if (project.userId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized',
            });
        }

        res.json({
            success: true,
            data: opportunity,
        });
    } catch (error: any) {
        console.error('Error fetching opportunity details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch opportunity details',
            error: error.message,
        });
    }
};

/**
 * Refresh AI insights for an opportunity
 */
export const refreshInsights = async (req: AuthRequest, res: Response) => {
    try {
        const { opportunityId } = req.params;
        const userId = req.user?.id;

        const opportunity = await RevenueOpportunity.findById(opportunityId).populate('projectId');

        if (!opportunity) {
            return res.status(404).json({
                success: false,
                message: 'Opportunity not found',
            });
        }

        // Verify ownership
        const project = opportunity.projectId as any;
        if (project.userId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized',
            });
        }

        // Regenerate AI insights
        const aiInsights = await eventDiscoveryService.generateEventInsights(
            {
                id: opportunity.eventId,
                name: opportunity.eventName,
                description: opportunity.description,
                startDate: opportunity.startDate,
                endDate: opportunity.endDate,
                location: opportunity.location,
                expectedAttendance: opportunity.expectedAttendance,
                type: opportunity.eventType,
                source: opportunity.source,
            },
            project.name,
            opportunity.distanceFromHotel
        );

        opportunity.aiInsights = {
            ...aiInsights,
            generatedAt: new Date(),
        };

        await opportunity.save();

        res.json({
            success: true,
            message: 'Insights refreshed successfully',
            data: opportunity,
        });
    } catch (error: any) {
        console.error('Error refreshing insights:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh insights',
            error: error.message,
        });
    }
};

/**
 * Delete an opportunity
 */
export const deleteOpportunity = async (req: AuthRequest, res: Response) => {
    try {
        const { opportunityId } = req.params;
        const userId = req.user?.id;

        const opportunity = await RevenueOpportunity.findById(opportunityId).populate('projectId');

        if (!opportunity) {
            return res.status(404).json({
                success: false,
                message: 'Opportunity not found',
            });
        }

        // Verify ownership
        const project = opportunity.projectId as any;
        if (project.userId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized',
            });
        }

        await RevenueOpportunity.findByIdAndDelete(opportunityId);

        res.json({
            success: true,
            message: 'Opportunity deleted successfully',
        });
    } catch (error: any) {
        console.error('Error deleting opportunity:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete opportunity',
            error: error.message,
        });
    }
};

/**
 * Generate marketing campaign image for an opportunity
 */
export const generateCampaignImage = async (req: AuthRequest, res: Response) => {
    try {
        const { opportunityId } = req.params;
        const userId = req.user?.id;

        const opportunity = await RevenueOpportunity.findById(opportunityId).populate('projectId');

        if (!opportunity) {
            return res.status(404).json({
                success: false,
                message: 'Opportunity not found',
            });
        }

        // Verify ownership
        const project = opportunity.projectId as any;
        if (project.userId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized',
            });
        }

        console.log(`🎨 Generating campaign image for opportunity: ${opportunity.eventName}`);

        // Generate campaign image using Gemini (primary) or DALL-E 3 (fallback)
        const { imageUrl, prompt, provider } = await imageGenerationService.generateCampaignImage({
            hotelName: project.googlePlacesData?.displayName || project.name,
            eventName: opportunity.eventName,
            eventType: opportunity.eventType,
            eventDescription: opportunity.description,
            eventDate: opportunity.startDate.toLocaleDateString('en-IN'),
            distanceKm: opportunity.distanceFromHotel,
            expectedAttendance: opportunity.expectedAttendance,
            city: opportunity.location.city,
        });

        console.log(`✅ Image generated using: ${provider.toUpperCase()}`);

        // Save image URL to opportunity
        opportunity.campaignImage = {
            url: imageUrl,
            prompt: prompt,
            provider: provider,
            generatedAt: new Date(),
        };

        await opportunity.save();

        res.json({
            success: true,
            message: 'Campaign image generated successfully',
            data: {
                imageUrl,
                prompt,
                provider,
            },
        });
    } catch (error: any) {
        console.error('Error generating campaign image:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate campaign image',
            error: error.message,
        });
    }
};
