import { openai } from '../config/openai';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Image Generation Service using DALL-E 3
 * Generates marketing campaign images for revenue opportunities
 */

interface CampaignImageOptions {
    hotelName: string;
    eventName: string;
    eventType: string;
    eventDescription: string;
    eventDate: string;
    distanceKm: number;
    expectedAttendance?: number;
    city: string;
}

/**
 * Generate a marketing campaign image using Google Gemini (primary) or DALL-E 3 (fallback)
 */
export async function generateCampaignImage(
    options: CampaignImageOptions
): Promise<{ imageUrl: string; prompt: string; provider: 'gemini' | 'dalle' }> {
    const {
        hotelName,
        eventName,
        eventType,
        eventDescription,
        eventDate,
        distanceKm,
        expectedAttendance,
        city
    } = options;

    // Create a detailed prompt for image generation
    const prompt = createImagePrompt(options);

    console.log(`🎨 Generating campaign image for: ${eventName}`);
    console.log(`📝 Prompt length: ${prompt.length} characters`);

    // Try Gemini 2.5 Flash Image first
    try {
        const geminiApiKey = process.env.GOOGLE_GEMINI_API;

        if (geminiApiKey) {
            console.log('🤖 Attempting image generation with Gemini 2.5 Flash Image...');

            // Use the new Gemini API endpoint for image generation
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${geminiApiKey}`,
                {
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.4,
                        topK: 32,
                        topP: 1,
                        maxOutputTokens: 8192
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 120000 // 120 second timeout for image generation
                }
            );

            console.log('📦 Gemini response received:', JSON.stringify(response.data).substring(0, 200));

            // Check if we got image data
            if (response.data?.candidates && response.data.candidates.length > 0) {
                const candidate = response.data.candidates[0];

                // Gemini returns inline data in parts
                if (candidate.content?.parts && candidate.content.parts.length > 0) {
                    const imagePart = candidate.content.parts.find((part: any) => part.inlineData);

                    if (imagePart?.inlineData?.data) {
                        // Convert base64 to data URL
                        const mimeType = imagePart.inlineData.mimeType || 'image/png';
                        const imageUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;
                        console.log(`✅ Image generated successfully with Gemini 2.5 Flash Image`);

                        return {
                            imageUrl,
                            prompt,
                            provider: 'gemini'
                        };
                    }
                }
            }

            console.log('⚠️ Gemini response did not contain image data, falling back to DALL-E');
            console.log('Response structure:', JSON.stringify(response.data, null, 2));
        } else {
            console.log('⚠️ Gemini API key not configured (GOOGLE_GEMINI_API), using DALL-E');
        }
    } catch (error: any) {
        console.error('❌ Gemini image generation failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        console.log('🔄 Falling back to DALL-E 3...');
    }

    // Fallback to DALL-E 3
    try {
        console.log('🤖 Generating image with DALL-E 3...');

        // DALL-E has a 4000 character limit
        let dallePrompt = prompt;
        if (prompt.length > 3900) {
            console.log('⚠️ Prompt too long for DALL-E, creating shortened version...');
            dallePrompt = createShortPrompt(options);
            console.log(`📝 Shortened prompt length: ${dallePrompt.length} characters`);
        }

        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: dallePrompt,
            n: 1,
            size: "1024x1024",
            quality: "standard",
            style: "vivid",
        });

        if (!response.data || response.data.length === 0) {
            throw new Error('No image data returned from DALL-E');
        }

        const imageUrl = response.data[0]?.url;

        if (!imageUrl) {
            throw new Error('No image URL returned from DALL-E');
        }

        console.log(`✅ Image generated successfully with DALL-E 3`);

        return {
            imageUrl,
            prompt: dallePrompt,
            provider: 'dalle'
        };
    } catch (error: any) {
        console.error('❌ Error generating campaign image with DALL-E:', error.message);
        throw new Error(`Failed to generate campaign image: ${error.message}`);
    }
}

/**
 * Create a shortened prompt for DALL-E (under 4000 characters)
 */
function createShortPrompt(options: CampaignImageOptions): string {
    const { hotelName, eventName, eventDate, eventType, city } = options;

    return `Professional hotel marketing poster for social media.

LARGE, BOLD TEXT REQUIREMENTS:
1. Top: "${hotelName}" - huge bold font, white/gold color, black outline
2. Center: "${eventName}" - MASSIVE bold font (largest text), high contrast, black outline
3. Below center: "${eventDate}" - large bold font
4. Bottom: "BOOK NOW" - very large bold font, button-style

TEXT RULES:
- Simple sans-serif fonts only (Arial Black, Impact)
- All text 10%+ of image height
- Thick black outlines on all text
- Dark backgrounds behind text
- Maximum 4 text elements

VISUAL:
- Professional photo of ${city}
- ${eventType} event atmosphere
- Golden hour lighting
- Landscape orientation
- Leave space for text (top 25%, center 30%, bottom 20%)

STYLE:
- Professional DSLR quality
- Warm, inviting colors
- High contrast for text
- Marketing poster aesthetic

This is a MARKETING POSTER - text clarity is critical.`;
}

/**
 * Create a universal, dynamic prompt for hotel marketing posters
 * Works for ANY hotel in ANY location worldwide
 * Focuses on clear text, professional design, and revenue-driving messaging
 */
function createImagePrompt(options: CampaignImageOptions): string {
    const {
        hotelName,
        eventName,
        eventType,
        eventDescription,
        eventDate,
        distanceKm,
        expectedAttendance,
        city
    } = options;

    // Build the marketing-focused prompt with EXTREME emphasis on text clarity
    const prompt = `Create a professional hotel marketing poster for social media advertising.

**CRITICAL TEXT REQUIREMENTS - THIS IS THE MOST IMPORTANT PART:**

YOU MUST INCLUDE EXACTLY THIS TEXT, LARGE AND CLEARLY READABLE:

**TEXT #1 - HOTEL NAME (Top of image):**
"${hotelName}"
- Font: Simple, bold sans-serif (like Arial Black or Helvetica Bold)
- Size: EXTREMELY LARGE - at least 15% of image height
- Color: Pure white OR bright gold
- Background: Dark semi-transparent overlay behind text for contrast
- Effect: Thick black outline/stroke (3-5px) around each letter
- Position: Top center, with 10% margin from top edge
- MUST be the first thing viewers see

**TEXT #2 - EVENT NAME (Center of image):**
"${eventName}"
- Font: Bold, thick sans-serif (like Impact or Arial Black)
- Size: MASSIVE - at least 20% of image height, LARGEST text on poster
- Color: Bright, high-contrast color (white, gold, or bright orange)
- Background: Dark semi-transparent box behind text
- Effect: Very thick black outline (5-8px) + subtle glow
- Position: Dead center of image
- MUST dominate the visual hierarchy

**TEXT #3 - DATE (Below event name):**
"${eventDate}"
- Font: Bold sans-serif
- Size: LARGE - at least 8% of image height
- Color: White or gold
- Background: Dark semi-transparent bar
- Position: Directly below event name

**TEXT #4 - CALL TO ACTION (Bottom of image):**
"BOOK NOW"
- Font: Extra bold sans-serif
- Size: VERY LARGE - at least 12% of image height
- Color: Bright orange, gold, or white
- Background: Solid dark bar across bottom (like a button)
- Effect: Make it look like a clickable button
- Position: Bottom 15% of image, centered

**CRITICAL TEXT RULES - FOLLOW EXACTLY:**
1. Use ONLY 1-2 simple, bold fonts (Arial Black, Helvetica Bold, Impact)
2. NO decorative or script fonts
3. NO small text - everything must be LARGE
4. NO text smaller than 8% of image height
5. ALWAYS put dark backgrounds behind white text
6. ALWAYS use thick black outlines on all text
7. Text must be readable from 5 meters away
8. Maximum 4 text elements total (hotel, event, date, CTA)
9. NO additional decorative text or details
10. Keep it SIMPLE and BOLD

**VISUAL COMPOSITION:**

**Background Scene:**
- Professional photograph of ${city}
- Show authentic local character and atmosphere
- Golden hour lighting (warm, inviting)
- Slightly blurred background to make text pop
- Leave clear space for text (top 25%, center 30%, bottom 20%)

**Event Atmosphere (${eventType}):**
${getEventSceneDescription(eventType, eventName, eventDescription)}

**Layout Requirements:**
- Landscape orientation (16:9 ratio preferred)
- Rule of thirds composition
- Top 25% reserved for hotel name
- Center 30% reserved for event name
- Bottom 20% reserved for call-to-action
- Background should be slightly darker to make text stand out

**Photography Style:**
- Professional quality
- Warm, inviting colors
- Good depth of field
- Natural lighting
- High contrast areas for text placement

**ABSOLUTELY FORBIDDEN:**
- Small, decorative text
- Script or cursive fonts
- Text without outlines or backgrounds
- Cluttered composition
- More than 4 text elements
- Text smaller than 8% of image height
- Low contrast text
- Text over busy backgrounds without overlay

**FINAL CHECKLIST - IMAGE MUST HAVE:**
✓ Hotel name in LARGE bold text at top
✓ Event name in MASSIVE bold text in center
✓ Date in LARGE text below event
✓ "BOOK NOW" in LARGE text at bottom
✓ All text has dark backgrounds or thick outlines
✓ Simple, bold fonts only
✓ High contrast everywhere
✓ Professional ${city} background

This is a MARKETING POSTER - text clarity is MORE IMPORTANT than artistic beauty.`;

    return prompt;
}

/**
 * Get event-specific scene description (universal, not location-dependent)
 */
function getEventSceneDescription(eventType: string, eventName: string, eventDescription: string): string {
    const baseDescription = `
- Show professional event atmosphere
- Include realistic crowd or attendees (shown from behind, in silhouette, or at distance)
- Proper venue setup and equipment
- Natural, authentic energy
- Professional lighting
- Real-world event elements`;

    switch (eventType) {
        case 'concert':
            return `**CONCERT/MUSIC EVENT:**
- Professional stage with lighting rigs and sound equipment
- Concert crowd with raised hands, phones recording
- Stage lights, spotlights, atmospheric effects
- Musical instruments or performers (silhouettes)
- Electric, energetic atmosphere
- VIP areas, barriers, professional setup${baseDescription}`;

        case 'festival':
            return `**FESTIVAL CELEBRATION:**
- Colorful decorations and festive atmosphere
- Traditional or cultural elements appropriate to the festival
- Crowds in festive attire
- Food stalls, entertainment areas
- Vibrant, joyful energy
- Cultural authenticity
- Celebration lighting (lanterns, lights, decorations)${baseDescription}`;

        case 'sports':
            return `**SPORTS EVENT:**
- Professional sports venue or stadium
- Sports equipment and field markings
- Enthusiastic fans and spectators
- Scoreboard, floodlights
- Team colors and banners
- Competitive, energetic atmosphere
- Athletes in action (distant or in motion)${baseDescription}`;

        case 'conference':
            return `**PROFESSIONAL CONFERENCE:**
- Modern conference hall or venue
- Professional AV setup (screens, podium, microphones)
- Business professionals in formal attire
- Networking areas, registration desks
- Corporate branding and banners
- Clean, professional aesthetic
- Knowledge-sharing atmosphere${baseDescription}`;

        case 'holiday':
            return `**HOLIDAY/SEASONAL CELEBRATION:**
- Festive decorations for the specific holiday
- Families and groups celebrating
- Traditional holiday elements
- Warm, inviting lighting
- Seasonal atmosphere
- Celebration and togetherness
- Appropriate cultural elements${baseDescription}`;

        default:
            return `**${eventName.toUpperCase()} EVENT:**
- Professional event venue setup
- Appropriate crowd for this type of event
- Proper signage and decoration
- Engaging, well-organized atmosphere
- Natural crowd dynamics
- Professional event management visible
- Authentic event experience${baseDescription}`;
    }
}

/**
 * Download and save image from URL to local storage
 */
export async function downloadAndSaveImage(
    imageUrl: string,
    opportunityId: string
): Promise<string> {
    try {
        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(process.cwd(), 'uploads', 'campaign-images');
        await fs.mkdir(uploadsDir, { recursive: true });

        // Download image
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000
        });

        if (!response.data) {
            throw new Error('No image data received');
        }

        // Generate filename
        const filename = `campaign-${opportunityId}-${Date.now()}.png`;
        const filepath = path.join(uploadsDir, filename);

        // Save to disk
        await fs.writeFile(filepath, response.data);

        console.log(`💾 Image saved to: ${filepath}`);

        // Return relative path for serving
        return `/uploads/campaign-images/${filename}`;
    } catch (error: any) {
        console.error('❌ Error downloading image:', error.message);
        throw new Error(`Failed to download image: ${error.message}`);
    }
}

export default {
    generateCampaignImage,
    downloadAndSaveImage
};
