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
 * Create Instagram-optimized marketing posts
 * Following Canva's clean, minimal design principles for maximum engagement
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

    // Canva-style Instagram post prompt with improved heading design
    const prompt = `Create a STUNNING, MODERN Instagram post for ${hotelName} - professional hotel marketing design.

INSTAGRAM FORMAT (Critical):
- Aspect ratio: 1:1 SQUARE (1080x1080px)
- Mobile-first design - must look perfect on phone screens
- Clean, modern layout with strategic white space
- Scroll-stopping, save-worthy visual

PHOTOGRAPHY STYLE:
- Professional travel photography of ${city}
- Golden hour lighting (warm, inviting, cinematic)
- Authentic location, recognizable landmarks
- Natural depth of field (sharp subject, soft background)
- High-quality, editorial standard
- Camera: Canon EOS R5, 35mm lens, f/2.8, ISO 400

MODERN DESIGN LAYOUT:
Use a CLEAN, BOLD approach with strong visual hierarchy:

═══════════════════════════════════
TOP SECTION (12% of image):
Subtle dark gradient overlay (rgba(0,0,0,0.5))
Text: "${hotelName}"
Font: Modern sans-serif (Poppins/Inter), 32pt, UPPERCASE, letter-spacing: 2px
Color: White (90% opacity)
Alignment: Center
Style: Minimalist, elegant
═══════════════════════════════════

MIDDLE SECTION (45% of image):
CLEAN PHOTOGRAPH - minimal text overlay
Let the stunning ${city} image be the hero
Show authentic ${eventType} atmosphere
Slight blur effect on edges for depth

═══════════════════════════════════
BOTTOM SECTION (43% of image):
Strong gradient overlay (rgba(0,0,0,0) to rgba(0,0,0,0.85))

MAIN HEADING (Eye-catching):
"${eventName}"
Font: Extra bold sans-serif (Montserrat Black/Poppins Bold), 64pt
Color: WHITE with vibrant accent
Style: Multi-line if needed, max 2 lines
Effect: Subtle glow/shadow for depth
Line height: 1.1 (tight, impactful)
Transform: Slight letter-spacing (1px)
Position: 60% from top

ACCENT LINE (Above or below heading):
Decorative element: Thin horizontal line or dots
Color: Bright orange (#FF6B35) or Gold (#FFD700)
Width: 60px
Style: Modern, minimal

PRICING HIGHLIGHT (Below heading):
"SPECIAL RATES FROM ₹3,999/NIGHT"
Font: Medium sans-serif (Poppins Medium), 36pt
Color: Bright gold (#FFD700)
Background: Subtle dark pill shape (rgba(0,0,0,0.6))
Padding: 8px 24px
Border-radius: 20px
Effect: Subtle glow

DATE & DETAILS (Below pricing):
"Event Date: ${eventDate}"
Font: Regular sans-serif (Inter/Poppins), 28pt
Color: White (70% opacity)
Style: Clean, minimal

CTA BUTTON (Bottom, prominent):
"BOOK NOW"
Style: Modern rounded button
Background: Vibrant gradient (orange to red: #FF6B35 to #FF4500)
Text: White, bold (Poppins Bold), 40pt
Padding: 18px 56px
Border-radius: 30px (pill shape)
Shadow: Strong drop shadow (0 4px 12px rgba(255,107,53,0.4))
Effect: Slightly elevated, clickable appearance
═══════════════════════════════════

TYPOGRAPHY RULES (Modern Instagram):
✓ Maximum 2 font families (Poppins + Inter OR Montserrat + Roboto)
✓ Bold hierarchy: HUGE heading → Medium pricing → Small details
✓ High contrast: White on dark, gold accents
✓ Generous line spacing for readability
✓ Letter-spacing on uppercase text
✓ Modern, clean sans-serif fonts only

COLOR PALETTE (Vibrant & Modern):
- Primary: Pure white (#FFFFFF)
- Accent 1: Bright gold (#FFD700) for pricing
- Accent 2: Vibrant orange (#FF6B35) for CTA
- Accent 3: Deep red (#FF4500) for gradient
- Overlays: Dark gradients (rgba(0,0,0,0.5-0.9))
- Background: Natural warm photo tones

VISUAL HIERARCHY (Critical):
1. Event name (LARGEST, most prominent)
2. Pricing (BRIGHT, attention-grabbing)
3. CTA button (VIBRANT, action-oriented)
4. Hotel name (subtle, top)
5. Date (minimal, supporting info)

WHITE SPACE STRATEGY:
✓ 35% of image should be breathing room
✓ Clear margins: 6% from all edges
✓ Generous padding in text containers
✓ Uncluttered middle section (photo hero)
✓ Balanced composition

MOBILE OPTIMIZATION:
✓ Heading readable from thumbnail view
✓ Minimum font size: 28pt
✓ High contrast ratios (7:1 for heading)
✓ Touch-friendly CTA (minimum 44px height)
✓ No critical text smaller than 24pt

INSTAGRAM TRENDS 2025:
✓ Bold, confident typography
✓ Vibrant accent colors
✓ Gradient buttons
✓ Pill-shaped elements
✓ Subtle glow effects
✓ Clean, modern aesthetic
✓ Scroll-stopping design
✓ Save-worthy content

PHOTOREALISTIC ELEMENTS:
✓ Natural film grain texture
✓ Authentic bokeh effect
✓ Realistic lighting and shadows
✓ Professional color grading
✓ Subtle vignette for focus
✓ Real ${city} landmarks/scenery
✓ Cinematic depth

AVOID (Critical):
✗ Cluttered layouts
✗ Weak, thin fonts for headings
✗ Low contrast text
✗ Text over busy areas without overlay
✗ Tiny text (under 24pt)
✗ Flat, boring buttons
✗ Decorative/script fonts
✗ Excessive effects

FINAL CHECKLIST:
✓ 1:1 square format for Instagram
✓ BOLD, eye-catching event name (64pt+)
✓ Vibrant gradient CTA button
✓ Semi-transparent overlays for text
✓ 2 modern fonts maximum
✓ Strategic white space (35%)
✓ Mobile-optimized sizes
✓ Strong visual hierarchy
✓ Professional ${city} photography
✓ Scroll-stopping appeal
✓ Ready to post immediately

This must look like a PREMIUM INSTAGRAM POST from a top hotel brand - bold, modern, clean, with an eye-catching heading that demands attention and drives immediate bookings.`;

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
