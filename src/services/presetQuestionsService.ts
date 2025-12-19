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
 * Generate dynamic preset questions based on available metrics
 */
export function generatePresetQuestions(metrics?: AggregatedMetrics): PresetQuestion[] {
  const questions: PresetQuestion[] = [];

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
