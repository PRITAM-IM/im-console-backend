import { AggregatedMetrics } from './metricsAggregator';

/**
 * Preset Questions Service
 * Generates contextual preset questions based on project data
 */

export interface PresetQuestion {
  id: string;
  question: string;
  category: 'overview' | 'performance' | 'comparison' | 'optimization' | 'trends';
  icon: string;
}

/**
 * Generate dynamic preset questions based on available metrics and page context
 * @param metrics - Project metrics
 * @param pageContext - Current page context (youtube, analytics, facebook, etc.)
 */
export function generatePresetQuestions(metrics?: AggregatedMetrics, pageContext?: string): PresetQuestion[] {
  const questions: PresetQuestion[] = [];

  // Context-specific questions come first
  if (pageContext) {
    const contextQuestions = getContextSpecificQuestions(pageContext, metrics);
    questions.push(...contextQuestions);
  }

  // Always available general questions
  const generalQuestions: PresetQuestion[] = [
    {
      id: 'overall-performance',
      question: 'How is my overall marketing performance?',
      category: 'overview',
      icon: '📊',
    },
    {
      id: 'top-channels',
      question: 'Which marketing channels are performing best?',
      category: 'performance',
      icon: '🏆',
    },
    {
      id: 'conversion-analysis',
      question: 'Analyze my conversion rates and suggest improvements',
      category: 'optimization',
      icon: '💡',
    },
    {
      id: 'monthly-trends',
      question: 'What are the key trends compared to last month?',
      category: 'trends',
      icon: '📈',
    },
  ];

  questions.push(...generalQuestions);

  // If metrics are available, add context-specific questions
  if (metrics) {
    // Check conversion performance
    if (metrics.conversionMetrics.conversionRate < 2) {
      questions.push({
        id: 'improve-conversions',
        question: 'Why is my conversion rate low and how can I improve it?',
        category: 'optimization',
        icon: '⚠️',
      });
    }

    // Check bounce rate
    if (metrics.trafficMetrics.bounceRate > 60) {
      questions.push({
        id: 'reduce-bounce',
        question: 'How can I reduce my bounce rate?',
        category: 'optimization',
        icon: '⚡',
      });
    }

    // Check for connected platforms with spending
    const hasGoogleAds = metrics.platformConnections.platformDetails.googleAds.connected;
    const hasMetaAds = metrics.platformConnections.platformDetails.metaAds.connected;

    if (hasGoogleAds || hasMetaAds) {
      questions.push({
        id: 'ad-roi',
        question: 'What is my return on ad spend (ROAS)?',
        category: 'performance',
        icon: '💰',
      });
    }

    // Check for social media presence
    const hasSocial =
      metrics.platformConnections.platformDetails.facebook.connected ||
      metrics.platformConnections.platformDetails.instagram.connected;

    if (hasSocial) {
      questions.push({
        id: 'social-engagement',
        question: 'How is my social media engagement trending?',
        category: 'trends',
        icon: '👥',
      });
    }

    // Check for SEO data
    if (metrics.platformConnections.platformDetails.searchConsole.connected) {
      questions.push({
        id: 'seo-performance',
        question: 'How can I improve my SEO rankings?',
        category: 'optimization',
        icon: '🔍',
      });
    }

    // Channel comparison questions
    if (metrics.channelBreakdown && metrics.channelBreakdown.length > 1) {
      questions.push({
        id: 'channel-comparison',
        question: `Compare ${metrics.topPerformers.bestChannel} vs ${metrics.topPerformers.worstChannel} performance`,
        category: 'comparison',
        icon: '⚖️',
      });
    }

    // Budget optimization
    if (hasGoogleAds && hasMetaAds) {
      questions.push({
        id: 'budget-allocation',
        question: 'How should I allocate my advertising budget?',
        category: 'optimization',
        icon: '💵',
      });
    }

    // Growth questions based on trends
    if (metrics.trafficMetrics.sessionsChange > 10) {
      questions.push({
        id: 'growth-drivers',
        question: 'What is driving my traffic growth?',
        category: 'trends',
        icon: '🚀',
      });
    } else if (metrics.trafficMetrics.sessionsChange < -10) {
      questions.push({
        id: 'traffic-decline',
        question: 'Why is my traffic declining and how to fix it?',
        category: 'optimization',
        icon: '📉',
      });
    }
  }

  // Limit to 8 most relevant questions
  return questions.slice(0, 8);
}

/**
 * Get context-specific questions based on the current page
 */
function getContextSpecificQuestions(context: string, metrics?: AggregatedMetrics): PresetQuestion[] {
  const contextQuestions: PresetQuestion[] = [];

  switch (context) {
    case 'youtube':
      contextQuestions.push(
        {
          id: 'youtube-performance',
          question: 'How are my YouTube videos performing?',
          category: 'performance',
          icon: '🎥',
        },
        {
          id: 'youtube-engagement',
          question: 'What is my YouTube engagement rate?',
          category: 'performance',
          icon: '👍',
        },
        {
          id: 'youtube-growth',
          question: 'How can I grow my YouTube subscribers?',
          category: 'optimization',
          icon: '📈',
        },
        {
          id: 'youtube-top-videos',
          question: 'Which videos are getting the most views?',
          category: 'performance',
          icon: '⭐',
        }
      );
      break;

    case 'analytics':
      contextQuestions.push(
        {
          id: 'ga-traffic',
          question: 'What are my top traffic sources?',
          category: 'performance',
          icon: '🌐',
        },
        {
          id: 'ga-bounce',
          question: 'Why is my bounce rate high?',
          category: 'optimization',
          icon: '⚠️',
        },
        {
          id: 'ga-conversions',
          question: 'How can I improve my conversion funnel?',
          category: 'optimization',
          icon: '🎯',
        },
        {
          id: 'ga-users',
          question: 'Who are my most engaged users?',
          category: 'performance',
          icon: '👥',
        }
      );
      break;

    case 'facebook':
      contextQuestions.push(
        {
          id: 'fb-engagement',
          question: 'How is my Facebook page engagement?',
          category: 'performance',
          icon: '👍',
        },
        {
          id: 'fb-posts',
          question: 'Which Facebook posts performed best?',
          category: 'performance',
          icon: '📝',
        },
        {
          id: 'fb-growth',
          question: 'How can I grow my Facebook followers?',
          category: 'optimization',
          icon: '📈',
        },
        {
          id: 'fb-reach',
          question: 'How do I increase my Facebook reach?',
          category: 'optimization',
          icon: '🚀',
        }
      );
      break;

    case 'instagram':
      contextQuestions.push(
        {
          id: 'ig-engagement',
          question: 'What is my Instagram engagement rate?',
          category: 'performance',
          icon: '❤️',
        },
        {
          id: 'ig-posts',
          question: 'Which Instagram posts got the most likes?',
          category: 'performance',
          icon: '📸',
        },
        {
          id: 'ig-growth',
          question: 'How can I grow my Instagram followers?',
          category: 'optimization',
          icon: '📈',
        },
        {
          id: 'ig-stories',
          question: 'How are my Instagram stories performing?',
          category: 'performance',
          icon: '⏰',
        }
      );
      break;

    case 'meta-ads':
      contextQuestions.push(
        {
          id: 'meta-roas',
          question: 'What is my Meta Ads ROAS?',
          category: 'performance',
          icon: '💰',
        },
        {
          id: 'meta-cpc',
          question: 'How can I reduce my Meta Ads CPC?',
          category: 'optimization',
          icon: '💵',
        },
        {
          id: 'meta-campaigns',
          question: 'Which Meta ad campaigns are performing best?',
          category: 'performance',
          icon: '🎯',
        },
        {
          id: 'meta-optimization',
          question: 'How can I optimize my Meta Ads budget?',
          category: 'optimization',
          icon: '⚡',
        }
      );
      break;

    case 'google-ads':
      contextQuestions.push(
        {
          id: 'gads-roas',
          question: 'What is my Google Ads ROAS?',
          category: 'performance',
          icon: '💰',
        },
        {
          id: 'gads-quality',
          question: 'How can I improve my Quality Score?',
          category: 'optimization',
          icon: '⭐',
        },
        {
          id: 'gads-keywords',
          question: 'Which keywords are driving conversions?',
          category: 'performance',
          icon: '🔑',
        },
        {
          id: 'gads-cpc',
          question: 'How can I reduce my cost per click?',
          category: 'optimization',
          icon: '💵',
        }
      );
      break;

    case 'search-console':
      contextQuestions.push(
        {
          id: 'gsc-rankings',
          question: 'How are my search rankings trending?',
          category: 'trends',
          icon: '📊',
        },
        {
          id: 'gsc-keywords',
          question: 'Which keywords drive the most traffic?',
          category: 'performance',
          icon: '🔍',
        },
        {
          id: 'gsc-ctr',
          question: 'How can I improve my click-through rate?',
          category: 'optimization',
          icon: '🎯',
        },
        {
          id: 'gsc-seo',
          question: 'What SEO improvements should I prioritize?',
          category: 'optimization',
          icon: '🚀',
        }
      );
      break;

    case 'linkedin':
      contextQuestions.push(
        {
          id: 'li-engagement',
          question: 'How is my LinkedIn engagement?',
          category: 'performance',
          icon: '💼',
        },
        {
          id: 'li-posts',
          question: 'Which LinkedIn posts performed best?',
          category: 'performance',
          icon: '📝',
        },
        {
          id: 'li-followers',
          question: 'How can I grow my LinkedIn following?',
          category: 'optimization',
          icon: '📈',
        },
        {
          id: 'li-leads',
          question: 'How do I generate more B2B leads?',
          category: 'optimization',
          icon: '🎯',
        }
      );
      break;

    default:
      // No context-specific questions
      break;
  }

  return contextQuestions;
}

/**
 * Get default preset questions (when no metrics available)
 */
export function getDefaultPresetQuestions(): PresetQuestion[] {
  return [
    {
      id: 'getting-started',
      question: 'Help me understand my dashboard',
      category: 'overview',
      icon: '🎯',
    },
    {
      id: 'connect-platforms',
      question: 'What platforms should I connect?',
      category: 'overview',
      icon: '🔗',
    },
    {
      id: 'marketing-strategy',
      question: 'What marketing strategies would work best for me?',
      category: 'optimization',
      icon: '💡',
    },
    {
      id: 'key-metrics',
      question: 'What key metrics should I track?',
      category: 'overview',
      icon: '📊',
    },
    {
      id: 'improve-performance',
      question: 'How can I improve my overall marketing performance?',
      category: 'optimization',
      icon: '⚡',
    },
    {
      id: 'competitive-advantage',
      question: 'How do I gain competitive advantage?',
      category: 'optimization',
      icon: '🏆',
    },
  ];
}

export default {
  generatePresetQuestions,
  getDefaultPresetQuestions,
};
