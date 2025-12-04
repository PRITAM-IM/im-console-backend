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

export default { generateOverviewAnalysis };

