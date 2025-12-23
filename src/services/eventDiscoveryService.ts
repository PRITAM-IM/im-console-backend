import axios from 'axios';
import { openai } from '../config/openai';
import { ENV } from '../config/env';

/**
 * Enhanced Event Discovery Service
 * Uses Google Places for location, Eventbrite, SerpAPI, and OpenRouter for comprehensive event discovery
 */

interface EventData {
    id: string;
    name: string;
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
    expectedAttendance?: number;
    type: 'concert' | 'festival' | 'sports' | 'conference' | 'holiday' | 'other';
    source: 'eventbrite' | 'serpapi' | 'openrouter' | 'manual';
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Safely parse a date string, returning a valid Date or a fallback
 * Ensures dates are in the future for event discovery
 */
function safeParseDate(dateString: string | undefined | null, fallbackDays: number = 30): Date {
    const now = new Date();
    const currentYear = now.getFullYear();

    if (!dateString) {
        return new Date(Date.now() + fallbackDays * 24 * 60 * 60 * 1000);
    }

    // First try direct parsing
    let parsed = new Date(dateString);

    // If it results in an invalid date or a past year (like 2001), try to fix it
    if (isNaN(parsed.getTime()) || parsed.getFullYear() < currentYear) {
        // Try adding current year or next year to short date formats like "Dec 19" or "19 Dec"
        const shortDatePatterns = [
            /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,  // "19 Dec"
            /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/i,  // "Dec 19"
        ];

        for (const pattern of shortDatePatterns) {
            if (pattern.test(dateString)) {
                // Try with current year
                let attempt = new Date(`${dateString} ${currentYear}`);
                if (!isNaN(attempt.getTime())) {
                    // If the date is in the past, try next year
                    if (attempt < now) {
                        attempt = new Date(`${dateString} ${currentYear + 1}`);
                    }
                    return attempt;
                }
            }
        }

        // Try other patterns
        const patterns = [
            /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
            /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
            /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i, // 15 Jan 2025
        ];

        for (const pattern of patterns) {
            const match = dateString.match(pattern);
            if (match) {
                try {
                    const attemptDate = new Date(dateString);
                    if (!isNaN(attemptDate.getTime()) && attemptDate.getFullYear() >= currentYear - 1) {
                        return attemptDate;
                    }
                } catch { }
            }
        }

        // Return a future date as fallback
        console.warn(`⚠️ Could not parse date: "${dateString}", using fallback ${fallbackDays} days from now`);
        return new Date(Date.now() + Math.abs(fallbackDays) * 24 * 60 * 60 * 1000);
    }

    return parsed;
}


/**
 * Fetch events from Eventbrite (FREE API)
 */
export async function fetchEventbriteEvents(
    city: string,
    latitude?: number,
    longitude?: number,
    radiusKm: number = 50
): Promise<EventData[]> {
    try {
        const apiKey = process.env.EVENTBRITE_PRIVATE_TOKEN || process.env.EVENTBRITE_API_KEY;
        if (!apiKey) {
            console.log('⚠️  Eventbrite API key not configured');
            return [];
        }

        console.log(`🎫 Fetching Eventbrite events for ${city}...`);

        const params: any = {
            'location.address': city,
            'location.within': `${radiusKm}km`,
            expand: 'venue',
            'start_date.range_start': new Date().toISOString(),
            'start_date.range_end': new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        };

        if (latitude && longitude) {
            params['location.latitude'] = latitude;
            params['location.longitude'] = longitude;
            console.log(`   Using coordinates: ${latitude}, ${longitude}`);
        }

        const response = await axios.get('https://www.eventbriteapi.com/v3/events/search/', {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            params,
            timeout: 10000,
        });

        console.log(`   Eventbrite API response status: ${response.status}`);
        console.log(`   Found ${response.data.events?.length || 0} events`);

        const events: EventData[] = response.data.events?.map((event: any) => ({
            id: `eventbrite_${event.id}`,
            name: event.name.text,
            description: event.description?.text || event.summary || '',
            startDate: safeParseDate(event.start?.utc),
            endDate: safeParseDate(event.end?.utc),
            location: {
                address: event.venue?.address?.localized_address_display || '',
                city: event.venue?.address?.city || city,
                state: event.venue?.address?.region || '',
                country: event.venue?.address?.country || '',
                latitude: event.venue?.latitude ? parseFloat(event.venue.latitude) : undefined,
                longitude: event.venue?.longitude ? parseFloat(event.venue.longitude) : undefined,
            },
            expectedAttendance: event.capacity || undefined,
            type: categorizeEvent(event.name.text, event.description?.text),
            source: 'eventbrite' as const,
        })) || [];

        console.log(`✅ Eventbrite: Found ${events.length} events`);
        return events;
    } catch (error: any) {
        console.error('❌ Eventbrite API error:', error.message);
        if (error.response) {
            console.error('   Response status:', error.response.status);
            console.error('   Response data:', JSON.stringify(error.response.data).substring(0, 200));
        }
        return [];
    }
}

/**
 * Fetch events using SerpAPI (Google Events)
 */
export async function fetchSerpAPIEvents(
    city: string,
    latitude?: number,
    longitude?: number
): Promise<EventData[]> {
    try {
        const apiKey = process.env.SERPAPI_API_KEY;
        if (!apiKey) {
            console.log('⚠️  SerpAPI key not configured');
            return [];
        }

        console.log(`🔍 Fetching SerpAPI events for ${city}...`);

        const response = await axios.get('https://serpapi.com/search', {
            params: {
                engine: 'google_events',
                q: `events in ${city}`,
                api_key: apiKey,
                hl: 'en',
            },
            timeout: 10000,
        });

        console.log(`   SerpAPI response status: ${response.status}`);
        console.log(`   Found ${response.data.events_results?.length || 0} events`);

        const events: EventData[] = response.data.events_results?.map((event: any) => ({
            id: `serp_${event.event_id || Math.random().toString(36).substr(2, 9)}`,
            name: event.title,
            description: event.description || '',
            startDate: safeParseDate(event.date?.start_date),
            endDate: safeParseDate(event.date?.when || event.date?.start_date),
            location: {
                address: event.address?.[0] || '',
                city: city,
                country: 'India',
                latitude: event.gps_coordinates?.latitude,
                longitude: event.gps_coordinates?.longitude,
            },
            type: categorizeEvent(event.title, event.description),
            source: 'serpapi' as const,
        })) || [];

        console.log(`✅ SerpAPI: Found ${events.length} events`);
        return events;
    } catch (error: any) {
        console.error('❌ SerpAPI error:', error.message);
        if (error.response) {
            console.error('   Response status:', error.response.status);
            console.error('   Response data:', JSON.stringify(error.response.data).substring(0, 200));
        }
        return [];
    }
}

/**
 * Fetch events using OpenRouter for web searching
 */
export async function fetchOpenRouterEvents(
    city: string,
    hotelName: string,
    latitude?: number,
    longitude?: number
): Promise<EventData[]> {
    try {
        const apiKey = ENV.OPENROUTER_API_KEY;
        if (!apiKey) {
            console.log('⚠️  OpenRouter API key not configured');
            return [];
        }

        console.log(`🤖 Using OpenRouter to search for events near ${city}...`);

        const prompt = `Search for upcoming events, festivals, conferences, concerts, and major gatherings happening in ${city} in the next 90 days. 

Focus on events that would attract visitors who might need hotel accommodations. Include:
- Event name
- Event type (concert, festival, sports, conference, etc.)
- Start and end dates
- Location/venue
- Expected attendance (if known)
- Brief description

Return the results as a JSON array with this structure:
[
  {
    "name": "Event Name",
    "type": "concert|festival|sports|conference|holiday|other",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "location": "Venue/Location",
    "expectedAttendance": number or null,
    "description": "Brief description"
  }
]

Only return valid JSON, no additional text.`;

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://hotel-analytics.com',
                'X-Title': 'Hotel Analytics - Event Discovery',
            },
            body: JSON.stringify({
                model: 'perplexity/llama-3.1-sonar-large-128k-online',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant that searches the web for upcoming events. Always return valid JSON arrays.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 2000,
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenRouter API error: ${response.status}`);
        }

        const data: any = await response.json();
        const content = data.choices[0]?.message?.content || '[]';

        // Extract JSON from markdown code blocks if present
        let jsonContent = content;
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            jsonContent = jsonMatch[1];
        }

        const rawEvents = JSON.parse(jsonContent);
        console.log(`   OpenRouter found ${rawEvents.length} events`);

        const events: EventData[] = rawEvents.map((event: any, index: number) => ({
            id: `openrouter_${Date.now()}_${index}`,
            name: event.name,
            description: event.description || '',
            startDate: new Date(event.startDate),
            endDate: new Date(event.endDate || event.startDate),
            location: {
                address: event.location || '',
                city: city,
                country: 'India',
                latitude: latitude,
                longitude: longitude,
            },
            expectedAttendance: event.expectedAttendance || undefined,
            type: event.type || categorizeEvent(event.name, event.description),
            source: 'openrouter' as const,
        }));

        console.log(`✅ OpenRouter: Found ${events.length} events`);
        return events;
    } catch (error: any) {
        console.error('❌ OpenRouter error:', error.message);
        return [];
    }
}

/**
 * Categorize event type based on name and description
 */
function categorizeEvent(
    name: string,
    description?: string
): 'concert' | 'festival' | 'sports' | 'conference' | 'holiday' | 'other' {
    const text = `${name} ${description}`.toLowerCase();

    if (text.match(/concert|music|band|singer|performance|show/)) return 'concert';
    if (text.match(/festival|celebration|carnival|fair/)) return 'festival';
    if (text.match(/sport|match|game|tournament|championship|cricket|football/)) return 'sports';
    if (text.match(/conference|summit|seminar|workshop|expo|convention/)) return 'conference';
    if (text.match(/holiday|diwali|holi|christmas|eid|new year/)) return 'holiday';

    return 'other';
}

/**
 * Generate AI insights for an event using OpenAI
 */
export async function generateEventInsights(
    eventData: EventData,
    hotelName: string,
    distanceKm: number
): Promise<{
    revenueOpportunity: 'High' | 'Medium' | 'Low';
    estimatedRoomDemand: number;
    recommendedCampaignStart: Date;
    suggestedActions: string[];
    targetAudience: string;
    pricingStrategy: string;
}> {
    try {
        const prompt = `You are a hotel revenue management expert for Indian hotels. Analyze this upcoming event and provide strategic recommendations.

**Event Details:**
- Name: ${eventData.name}
- Type: ${eventData.type}
- Date: ${eventData.startDate.toLocaleDateString('en-IN')} to ${eventData.endDate.toLocaleDateString('en-IN')}
- Location: ${eventData.location.city}, India
- Distance from hotel: ${distanceKm.toFixed(1)} km
- Expected Attendance: ${eventData.expectedAttendance || 'Unknown'}
- Description: ${eventData.description}

**Hotel:** ${hotelName}

Provide a JSON response with:
1. revenueOpportunity: "High", "Medium", or "Low"
2. estimatedRoomDemand: Number (estimated rooms that could be booked)
3. recommendedCampaignStart: ISO date (when to start marketing, typically 2-3 months before)
4. suggestedActions: Array of 3-5 specific marketing actions relevant to Indian audience
5. targetAudience: Description of who to target
6. pricingStrategy: Pricing recommendation in INR context (use ₹ symbol)

Format as valid JSON only.`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are a hotel revenue management expert. Respond only with valid JSON.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: 800,
        });

        const response = completion.choices[0]?.message?.content || '{}';
        const insights = JSON.parse(response);

        return {
            revenueOpportunity: insights.revenueOpportunity || 'Medium',
            estimatedRoomDemand: insights.estimatedRoomDemand || 10,
            recommendedCampaignStart: safeParseDate(insights.recommendedCampaignStart, -30), // 30 days from now if invalid
            suggestedActions: insights.suggestedActions || [],
            targetAudience: insights.targetAudience || 'Event attendees',
            pricingStrategy: insights.pricingStrategy || 'Standard pricing',
        };
    } catch (error: any) {
        console.error('❌ AI insights generation error:', error.message);

        // Fallback insights
        const daysUntilEvent = Math.floor(
            (eventData.startDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        return {
            revenueOpportunity: distanceKm < 10 ? 'High' : distanceKm < 30 ? 'Medium' : 'Low',
            estimatedRoomDemand: Math.floor((eventData.expectedAttendance || 1000) * 0.15),
            recommendedCampaignStart: new Date(Date.now() + (daysUntilEvent - 60) * 24 * 60 * 60 * 1000),
            suggestedActions: [
                'Create targeted social media campaigns',
                'Offer early bird discounts',
                'Partner with event organizers',
            ],
            targetAudience: `${eventData.type} attendees`,
            pricingStrategy: 'Increase rates by 20-30% during event dates. Consider ₹500-₹1500 premium per night.',
        };
    }
}

/**
 * Discover all events for a hotel location
 */
export async function discoverEvents(
    city: string,
    hotelName: string,
    latitude?: number,
    longitude?: number,
    radiusKm: number = 50
): Promise<EventData[]> {
    console.log(`🔍 Discovering events for ${hotelName} in ${city}...`);
    console.log(`   Location: ${latitude}, ${longitude}`);

    const [eventbriteEvents, serpEvents, openRouterEvents] = await Promise.all([
        fetchEventbriteEvents(city, latitude, longitude, radiusKm),
        fetchSerpAPIEvents(city, latitude, longitude),
        fetchOpenRouterEvents(city, hotelName, latitude, longitude),
    ]);

    const allEvents = [...eventbriteEvents, ...serpEvents, ...openRouterEvents];

    // Filter events within radius if coordinates available
    let filteredEvents = allEvents;
    if (latitude && longitude) {
        filteredEvents = allEvents.filter((event) => {
            if (!event.location.latitude || !event.location.longitude) return true;
            const distance = calculateDistance(
                latitude,
                longitude,
                event.location.latitude,
                event.location.longitude
            );
            return distance <= radiusKm;
        });
    }

    // Remove duplicates and sort by date
    const uniqueEvents = Array.from(
        new Map(filteredEvents.map((event) => [event.name + event.startDate.toISOString(), event])).values()
    ).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    console.log(`✅ Discovered ${uniqueEvents.length} unique events`);
    return uniqueEvents;
}

export default {
    discoverEvents,
    generateEventInsights,
    calculateDistance,
};
