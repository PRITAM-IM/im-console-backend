import { ENV } from '../config/env';
import Project from '../models/Project';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

const SYSTEM_PROMPT = `You are a friendly hotel marketing consultant speaking directly to a hotel manager. Analyze their dashboard metrics and give clear, actionable advice they can understand and act on TODAY.

OUTPUT FORMAT (use clean Markdown with emojis):

## 🔴 What Needs Attention

Write 3-5 issues in plain English. For each issue:
- Start with a clear problem statement
- Show the specific number that proves it
- Explain WHY this matters for their business (lost bookings, wasted money, missed guests)

Example: "Your website visitors leave too fast — 48% bounce rate means nearly half your paid traffic is wasted before they even see your rooms."

## ✅ Your Action Plan

Write 4-6 specific steps they can take THIS WEEK. For each:
- Start with a clear action verb (Fix, Add, Create, Stop, Start)
- Be specific about WHAT to do
- Include expected benefit in simple terms (more bookings, save money, get more followers)

Example: "Fix your mobile booking page — compress images and simplify the form. This alone could turn 50+ bounced visitors into actual bookings each month."

## 💡 Quick Win

End with ONE thing they can do in the next 30 minutes that will make an immediate difference.

TONE & STYLE:
- Write like you're talking to a busy hotel owner over coffee
- No marketing jargon — use simple words
- Be honest but encouraging
- Use "you/your" language
- Numbers should be rounded and easy to grasp
- Max 500 words total`;

interface MetricsData {
  projectName: string;
  website?: any;
  advertising?: any;
  social?: any;
  seo?: any;
  rawMetrics?: Record<string, any>;
}

export async function generateOverviewAnalysis(
  projectId: string,
  metricsData: MetricsData,
  forceRegenerate: boolean = false
): Promise<{ analysis: string; fromCache: boolean; generatedAt: Date }> {
  // Check cache first
  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  // Return cached if valid and not forcing regeneration
  if (
    !forceRegenerate &&
    project.overviewAnalysis &&
    project.overviewGeneratedAt
  ) {
    const cacheAge = Date.now() - project.overviewGeneratedAt.getTime();
    if (cacheAge < CACHE_DURATION_MS) {
      console.log(`[AI Analysis] Returning cached analysis for project ${projectId}`);
      return {
        analysis: project.overviewAnalysis,
        fromCache: true,
        generatedAt: project.overviewGeneratedAt,
      };
    }
  }

  // Generate new analysis
  console.log(`[AI Analysis] Generating new analysis for project ${projectId}`);

  if (!ENV.OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  const userPrompt = buildUserPrompt(metricsData);

  const PRIMARY_MODEL = 'x-ai/grok-4.1-fast:free';
  const FALLBACK_MODEL = 'z-ai/glm-4.5-air:free';

  const callOpenRouter = async (model: string) => {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENV.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Hotel Analytics Dashboard',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });
    return response;
  };

  try {
    // Try primary model first
    console.log(`[AI Analysis] Trying primary model: ${PRIMARY_MODEL}`);
    let response = await callOpenRouter(PRIMARY_MODEL);

    // If primary fails, try fallback
    if (!response.ok) {
      console.warn(`[AI Analysis] Primary model failed (${response.status}), trying fallback: ${FALLBACK_MODEL}`);
      response = await callOpenRouter(FALLBACK_MODEL);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Analysis] OpenRouter error:', errorText);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const analysis = data.choices?.[0]?.message?.content || 'Unable to generate analysis';
    const generatedAt = new Date();

    // Cache the result
    await Project.findByIdAndUpdate(projectId, {
      overviewAnalysis: analysis,
      overviewGeneratedAt: generatedAt,
    });

    console.log(`[AI Analysis] Analysis generated and cached for project ${projectId}`);

    return {
      analysis,
      fromCache: false,
      generatedAt,
    };
  } catch (error: any) {
    console.error('[AI Analysis] Error:', error.message);
    throw new Error(`Failed to generate analysis: ${error.message}`);
  }
}

// Safe value helpers to prevent runtime errors
const safe = (val: any, fallback: string = 'N/A'): string => 
  (val !== null && val !== undefined) ? String(val) : fallback;

const safeNum = (val: any, decimals: number = 0, fallback: string = 'N/A'): string => 
  (typeof val === 'number' && !isNaN(val)) ? val.toFixed(decimals) : fallback;

const safeLocale = (val: any, fallback: string = '0'): string => 
  (typeof val === 'number' && !isNaN(val)) ? val.toLocaleString() : fallback;

function buildUserPrompt(metrics: MetricsData): string {
  let prompt = `Analyze this hotel's marketing performance:\n\n`;
  prompt += `**Hotel:** ${metrics.projectName}\n\n`;

  if (metrics.website) {
    prompt += `**WEBSITE (GA4):**\n`;
    prompt += `- Users: ${safeLocale(metrics.website.users)}\n`;
    prompt += `- Sessions: ${safeLocale(metrics.website.sessions)}\n`;
    prompt += `- Bounce Rate: ${safeNum(metrics.website.bounceRate, 1)}%\n`;
    prompt += `- Avg Session: ${safeNum(metrics.website.avgSessionDuration, 0)}s\n`;
    prompt += `- New Users: ${safeLocale(metrics.website.newUsers)}\n\n`;
  } else {
    prompt += `**WEBSITE:** Not connected\n\n`;
  }

  if (metrics.advertising) {
    prompt += `**ADVERTISING (Google Ads + Meta):**\n`;
    prompt += `- Total Spend: $${safeLocale(metrics.advertising.totalSpend)}\n`;
    prompt += `- Clicks: ${safeLocale(metrics.advertising.totalClicks)}\n`;
    prompt += `- Impressions: ${safeLocale(metrics.advertising.totalImpressions)}\n`;
    prompt += `- Conversions: ${safe(metrics.advertising.totalConversions, '0')}\n`;
    prompt += `- Avg CPC: $${safeNum(metrics.advertising.avgCpc, 2, '0')}\n`;
    prompt += `- Avg CTR: ${safeNum(metrics.advertising.avgCtr, 2, '0')}%\n\n`;
  } else {
    prompt += `**ADVERTISING:** Not connected\n\n`;
  }

  if (metrics.social) {
    prompt += `**SOCIAL MEDIA:**\n`;
    prompt += `- Total Followers: ${safeLocale(metrics.social.totalFollowers)}\n`;
    prompt += `- Total Engagement: ${safeLocale(metrics.social.totalEngagement)}\n`;
    prompt += `- Total Reach: ${safeLocale(metrics.social.totalReach)}\n`;
    if (metrics.social.platforms?.length) {
      metrics.social.platforms.forEach((p: any) => {
        prompt += `  - ${p.name}: ${safeLocale(p.followers)} followers, ${safeLocale(p.engagement)} engagement\n`;
      });
    }
    prompt += `\n`;
  } else {
    prompt += `**SOCIAL MEDIA:** Not connected\n\n`;
  }

  if (metrics.seo) {
    prompt += `**SEO (Search Console):**\n`;
    prompt += `- Clicks: ${safeLocale(metrics.seo.clicks)}\n`;
    prompt += `- Impressions: ${safeLocale(metrics.seo.impressions)}\n`;
    prompt += `- Avg Position: ${safeNum(metrics.seo.avgPosition, 1)}\n`;
    prompt += `- CTR: ${safe(metrics.seo.ctr, '0')}%\n\n`;
  } else {
    prompt += `**SEO:** Not connected\n\n`;
  }

  if (metrics.rawMetrics) {
    prompt += `**ADDITIONAL DATA:**\n`;
    prompt += JSON.stringify(metrics.rawMetrics, null, 2).substring(0, 1000);
    prompt += `\n\n`;
  }

  prompt += `Provide your analysis now:`;
  return prompt;
}

// Service-specific analysis
export async function analyzeService(
  projectId: string,
  serviceType: string
): Promise<{ analysis: string }> {
  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  if (!ENV.OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  let systemPrompt = '';
  let userPrompt = '';

  // Define prompts based on service type
  switch (serviceType) {
    case 'save-your-money':
      systemPrompt = `You are an expert hotel marketing consultant. Analyze ALL connected services for this hotel and provide a comprehensive action plan.

OUTPUT FORMAT (use clean Markdown with emojis):

## 🔴 What's Going Wrong

List 3-5 critical issues across all connected platforms. For each:
- Identify the specific problem
- Show the data that proves it
- Explain the business impact (lost revenue, wasted ad spend, etc.)

## 💡 Suggestions

Provide 4-6 actionable recommendations prioritized by impact:
- Quick wins (< 1 week)
- Medium-term improvements (1-4 weeks)
- Strategic changes (1-3 months)

## ⚡ Quick Wins

List 3-5 CRITICAL actions they must take this week to save money and improve ROI, ranked by urgency and potential cost savings.

TONE: Direct, actionable, data-driven but friendly. Focus on cost optimization and ROI improvement.`;
      userPrompt = await buildMustTakeActionsPrompt(project);
      break;

    case 'google-ads':
      systemPrompt = getServiceSystemPrompt('Google Ads', 'ad campaigns, ROAS, CTR, CPC, conversion tracking');
      userPrompt = await buildGoogleAdsPrompt(projectId);
      break;

    case 'google-analytics':
      systemPrompt = getServiceSystemPrompt('Google Analytics', 'website traffic, user behavior, bounce rate, conversions');
      userPrompt = await buildGoogleAnalyticsPrompt(projectId);
      break;

    case 'google-search-console':
      systemPrompt = getServiceSystemPrompt('Google Search Console', 'SEO performance, keyword rankings, click-through rates');
      userPrompt = await buildSearchConsolePrompt(projectId);
      break;

    case 'meta-ads':
      systemPrompt = getServiceSystemPrompt('Meta Ads (Facebook/Instagram)', 'social advertising, engagement, ROAS');
      userPrompt = await buildMetaAdsPrompt(projectId);
      break;

    case 'facebook-insights':
      systemPrompt = getServiceSystemPrompt('Facebook Page Insights', 'page engagement, reach, follower growth');
      userPrompt = await buildFacebookPrompt(projectId);
      break;

    case 'youtube-insights':
      systemPrompt = getServiceSystemPrompt('YouTube Channel', 'video performance, subscriber growth, engagement');
      userPrompt = await buildYouTubePrompt(projectId);
      break;

    case 'google-places':
      systemPrompt = getServiceSystemPrompt('Google Places Reviews', 'reputation management, review ratings, customer feedback, guest satisfaction');
      userPrompt = await buildGooglePlacesPrompt(projectId);
      break;

    default:
      throw new Error('Invalid service type');
  }

  const PRIMARY_MODEL = 'x-ai/grok-4.1-fast:free';
  const FALLBACK_MODEL = 'z-ai/glm-4.5-air:free';

  const callOpenRouter = async (model: string) => {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENV.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Hotel Analytics Dashboard - AI Master',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.4,
      }),
    });
    return response;
  };

  try {
    console.log(`[AI Master] Analyzing ${serviceType} for project ${projectId}`);
    let response = await callOpenRouter(PRIMARY_MODEL);

    if (!response.ok) {
      console.warn(`[AI Master] Primary model failed, trying fallback`);
      response = await callOpenRouter(FALLBACK_MODEL);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Master] OpenRouter error:', errorText);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;  
    };

    const analysis = data.choices?.[0]?.message?.content || 'Unable to generate analysis';

    return { analysis };
  } catch (error: any) {
    console.error('[AI Master] Error:', error.message);
    throw new Error(`Failed to analyze service: ${error.message}`);
  }
}

function getServiceSystemPrompt(serviceName: string, focus: string): string {
  return `You are an expert hotel marketing consultant specializing in ${serviceName}. Analyze the data and provide insights focused on ${focus}.

OUTPUT FORMAT (use clean Markdown with emojis):

## 🔴 What's Going Wrong

Identify 2-3 issues with specific metrics and business impact.

## ✅ What's Going Right  

Highlight 1-2 positive trends to maintain.

## 💡 Suggestions

Provide 3-5 specific, actionable recommendations.

## 🎯 Must Take Actions

List 2-3 critical actions for this week.

TONE: Direct, actionable, data-driven. Focus only on ${serviceName} data.`;
}

async function buildMustTakeActionsPrompt(project: any): Promise<string> {
  let prompt = `Hotel: ${project.name}

Connected Services Analysis:

`;
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  // Google Analytics Data
  if (project.gaPropertyId) {
    try {
      const { getGA4Metrics } = require('../services/googleAnalyticsService');
      const gaData = await getGA4Metrics(project._id.toString(), startDateStr, endDateStr);
      
      prompt += `**GOOGLE ANALYTICS (Last 7 Days):**\n`;
      prompt += `- Users: ${gaData.users || 0}\n`;
      prompt += `- Sessions: ${gaData.sessions || 0}\n`;
      prompt += `- Bounce Rate: ${gaData.bounceRate || 0}%\n`;
      prompt += `- Avg Session Duration: ${gaData.avgSessionDuration || 0}s\n`;
      prompt += `- New Users: ${gaData.newUsers || 0}\n\n`;
    } catch (error) {
      prompt += `**GOOGLE ANALYTICS:** Connected but data unavailable\n\n`;
    }
  }

  // Google Ads Data
  if (project.googleAdsCustomerId) {
    try {
      const { getOverviewMetrics } = require('../services/googleAdsService');
      const adsData = await getOverviewMetrics(project._id.toString(), startDateStr, endDateStr);
      
      prompt += `**GOOGLE ADS (Last 7 Days):**\n`;
      prompt += `- Total Spend: $${adsData.cost || 0}\n`;
      prompt += `- Clicks: ${adsData.clicks || 0}\n`;
      prompt += `- Impressions: ${adsData.impressions || 0}\n`;
      prompt += `- CTR: ${adsData.ctr || 0}%\n`;
      prompt += `- CPC: $${adsData.averageCpc || 0}\n`;
      prompt += `- Conversions: ${adsData.conversions || 0}\n\n`;
    } catch (error) {
      prompt += `**GOOGLE ADS:** Connected but data unavailable\n\n`;
    }
  }

  // Search Console Data
  if (project.searchConsoleSiteUrl) {
    try {
      const { getSearchAnalytics } = require('../services/googleSearchConsoleService');
      const searchData = await getSearchAnalytics(project._id.toString(), startDateStr, endDateStr);
      
      prompt += `**GOOGLE SEARCH CONSOLE (Last 7 Days):**\n`;
      prompt += `- Total Clicks: ${searchData.totalClicks || 0}\n`;
      prompt += `- Total Impressions: ${searchData.totalImpressions || 0}\n`;
      prompt += `- Average CTR: ${searchData.averageCtr || 0}%\n`;
      prompt += `- Average Position: ${searchData.averagePosition || 0}\n\n`;
    } catch (error) {
      prompt += `**GOOGLE SEARCH CONSOLE:** Connected but data unavailable\n\n`;
    }
  }

  // Meta Ads Data
  if (project.metaAdsAccountId) {
    try {
      const { getAccountInsights } = require('../services/metaAdsService');
      const metaData = await getAccountInsights(project._id.toString(), startDateStr, endDateStr);
      
      prompt += `**META ADS (Last 7 Days):**\n`;
      prompt += `- Total Spend: $${metaData.spend || 0}\n`;
      prompt += `- Clicks: ${metaData.clicks || 0}\n`;
      prompt += `- Impressions: ${metaData.impressions || 0}\n`;
      prompt += `- CTR: ${metaData.ctr || 0}%\n`;
      prompt += `- CPC: $${metaData.cpc || 0}\n\n`;
    } catch (error) {
      prompt += `**META ADS:** Connected but data unavailable\n\n`;
    }
  }

  // Facebook Page Data
  if (project.facebookPageId) {
    try {
      const { getPageInsights } = require('../services/facebookService');
      const fbData = await getPageInsights(project._id.toString());
      
      prompt += `**FACEBOOK PAGE:**\n`;
      prompt += `- Followers: ${fbData.followers || 0}\n`;
      prompt += `- Engagement Rate: ${fbData.engagementRate || 0}%\n`;
      prompt += `- Reach: ${fbData.reach || 0}\n\n`;
    } catch (error) {
      prompt += `**FACEBOOK PAGE:** Connected but data unavailable\n\n`;
    }
  }

  // YouTube Channel Data
  if (project.youtubeChannelId) {
    try {
      const { getChannelAnalytics } = require('../services/youtubeService');
      const ytData = await getChannelAnalytics(project._id.toString(), startDateStr, endDateStr);
      
      prompt += `**YOUTUBE CHANNEL (Last 7 Days):**\n`;
      prompt += `- Views: ${ytData.views || 0}\n`;
      prompt += `- Watch Time: ${ytData.watchTime || 0} minutes\n`;
      prompt += `- Subscribers Gained: ${ytData.subscribersGained || 0}\n`;
      prompt += `- Average View Duration: ${ytData.avgViewDuration || 0}s\n\n`;
    } catch (error) {
      prompt += `**YOUTUBE CHANNEL:** Connected but data unavailable\n\n`;
    }
  }

  // LinkedIn Page Data (if you have it)
  if (project.linkedinPageId) {
    prompt += `**LINKEDIN PAGE:** Connected\n\n`;
  }

  // Google Places Reviews & Ratings
  if (project.googlePlacesId) {
    try {
      const googlePlacesService = require('./googlePlacesService').default;
      const placeDetails = await googlePlacesService.getPlaceDetails(project.googlePlacesId);
      
      prompt += `**GOOGLE PLACES (${placeDetails.displayName}):**\n`;
      prompt += `- Average Rating: ${placeDetails.rating || 0}/5\n`;
      prompt += `- Total Reviews: ${placeDetails.userRatingCount || 0}\n`;
      
      if (placeDetails.reviews && placeDetails.reviews.length > 0) {
        const recentCount = placeDetails.reviews.length;
        prompt += `- Recent Reviews Fetched: ${recentCount}\n`;
        
        // Calculate sentiment from recent reviews
        const ratingCounts: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        placeDetails.reviews.forEach((review: any) => {
          if (review.rating) ratingCounts[review.rating]++;
        });
        const negativeReviews = ratingCounts[1] + ratingCounts[2];
        if (negativeReviews > 0) {
          prompt += `- Low Ratings (1-2 stars): ${negativeReviews} reviews need attention\n`;
        }
      }
      prompt += `\n`;
    } catch (error) {
      prompt += `**GOOGLE PLACES:** Connected but data unavailable\n\n`;
    }
  }
  
  prompt += `\n**ANALYSIS REQUEST:**\nAnalyze ALL the data above from every connected service. Identify where money is being wasted, what optimizations can save costs, and provide specific quick wins to reduce expenses while maintaining or improving performance. Focus on ROI, cost efficiency, and actionable money-saving opportunities.`;
  
  return prompt;
}

async function buildGoogleAdsPrompt(projectId: string): Promise<string> {
  // Fetch Google Ads data
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    // This would call the actual Google Ads service
    return `Analyze Google Ads performance for the last 7 days. Focus on ROAS, CPC, CTR, and conversion rates.`;
  } catch (error) {
    return `Google Ads data unavailable. Provide general best practices for hotel Google Ads campaigns.`;
  }
}

async function buildGoogleAnalyticsPrompt(projectId: string): Promise<string> {
  return `Analyze Google Analytics data focusing on traffic sources, user behavior, bounce rates, and conversion funnels for hotel website.`;
}

async function buildSearchConsolePrompt(projectId: string): Promise<string> {
  return `Analyze Google Search Console data focusing on keyword performance, click-through rates, and search visibility for hotel website.`;
}

async function buildMetaAdsPrompt(projectId: string): Promise<string> {
  return `Analyze Meta Ads (Facebook/Instagram) performance focusing on engagement, ROAS, and audience targeting for hotel marketing.`;
}

async function buildFacebookPrompt(projectId: string): Promise<string> {
  return `Analyze Facebook Page performance focusing on engagement rates, reach, follower growth, and content performance for hotel.`;
}

async function buildYouTubePrompt(projectId: string): Promise<string> {
  return `Analyze YouTube channel performance focusing on views, watch time, subscriber growth, and video engagement for hotel.`;
}

async function buildGooglePlacesPrompt(projectId: string): Promise<string> {
  try {
    const project = await Project.findById(projectId);
    if (!project || !project.googlePlacesId) {
      return `Google Places data unavailable. Please connect your hotel via Google Places to get review analysis, rating insights, and guest feedback trends.`;
    }

    // Get Google Places service
    const googlePlacesService = require('./googlePlacesService').default;
    const placeDetails = await googlePlacesService.getPlaceDetails(project.googlePlacesId);

    let prompt = `**GOOGLE PLACES DATA ANALYSIS FOR HOTEL**\n\n`;
    prompt += `**Hotel:** ${placeDetails.displayName}\n`;
    prompt += `**Location:** ${placeDetails.formattedAddress}\n\n`;

    // Rating Overview
    if (placeDetails.rating) {
      prompt += `**RATING OVERVIEW:**\n`;
      prompt += `- Average Rating: ${placeDetails.rating}/5\n`;
      prompt += `- Total Reviews: ${placeDetails.userRatingCount || 0}\n`;
      prompt += `- Business Status: ${placeDetails.businessStatus || 'Unknown'}\n\n`;
    }

    // Recent Reviews Analysis
    if (placeDetails.reviews && placeDetails.reviews.length > 0) {
      prompt += `**RECENT REVIEWS (${placeDetails.reviews.length} latest):**\n`;
      
      // Calculate rating distribution
      const ratingCounts: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      placeDetails.reviews.forEach((review: any) => {
        if (review.rating) ratingCounts[review.rating]++;
      });
      
      prompt += `- 5 Stars: ${ratingCounts[5]} reviews\n`;
      prompt += `- 4 Stars: ${ratingCounts[4]} reviews\n`;
      prompt += `- 3 Stars: ${ratingCounts[3]} reviews\n`;
      prompt += `- 2 Stars: ${ratingCounts[2]} reviews\n`;
      prompt += `- 1 Star: ${ratingCounts[1]} reviews\n\n`;

      // Sample review excerpts
      prompt += `**SAMPLE REVIEWS:**\n`;
      placeDetails.reviews.slice(0, 5).forEach((review: any, index: number) => {
        const stars = '⭐'.repeat(review.rating || 0);
        const text = review.text?.text || review.originalText?.text || 'No comment';
        const author = review.authorAttribution?.displayName || 'Anonymous';
        const time = review.relativePublishTimeDescription || 'Recently';
        
        prompt += `${index + 1}. ${stars} - ${author} (${time})\n`;
        prompt += `   "${text.substring(0, 200)}${text.length > 200 ? '...' : ''}"\n\n`;
      });
    }

    // Contact Information
    if (placeDetails.websiteUri || placeDetails.internationalPhoneNumber) {
      prompt += `**CONTACT INFORMATION:**\n`;
      if (placeDetails.websiteUri) prompt += `- Website: ${placeDetails.websiteUri}\n`;
      if (placeDetails.internationalPhoneNumber) prompt += `- Phone: ${placeDetails.internationalPhoneNumber}\n`;
      prompt += `\n`;
    }

    prompt += `\n**ANALYSIS REQUEST:**\nAnalyze the Google Places data above. Focus on:\n`;
    prompt += `1. Overall reputation and rating trends\n`;
    prompt += `2. Common themes in positive and negative reviews\n`;
    prompt += `3. Guest satisfaction patterns and pain points\n`;
    prompt += `4. Actionable recommendations to improve ratings and reviews\n`;
    prompt += `5. Response strategy for negative reviews\n`;
    prompt += `6. Strengths to highlight in marketing\n\n`;
    prompt += `Provide specific, actionable insights based on the review content and ratings.`;

    return prompt;
  } catch (error: any) {
    console.error('[AI Analysis] Error building Google Places prompt:', error.message);
    return `Google Places data unavailable. Error: ${error.message}. Please ensure Google Places is properly connected.`;
  }
}

export default { generateOverviewAnalysis, analyzeService };

