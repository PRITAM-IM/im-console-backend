import { openai, OPENAI_CONFIG } from '../config/openai';
import { ChatMessage, IChatMessage } from '../models/ChatMessage';
import { ChatConversation, IChatConversation } from '../models/ChatConversation';
import { ChatContext } from '../models/ChatContext';
import metricsAggregator, { AggregatedMetrics } from './metricsAggregator';
import contextFormatter from './contextFormatter';
import { handleOpenAIError, retryWithBackoff, validateOpenAIConfig } from '../utils/openaiErrorHandler';
import { checkTokenLimits, truncateMessages } from './tokenService';
import { ENV } from '../config/env';
import mongoose from 'mongoose';
import ragService from './ragService';

/**
 * Chat Service
 * Handles all chat operations including context building, OpenAI calls, and message storage
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface SendMessageParams {
  userId: string;
  projectId: string;
  message: string;
  conversationId?: string;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  pageContext?: string;
}

export interface SendMessageResponse {
  conversationId: string;
  messageId: string;
  response: string;
  metrics?: AggregatedMetrics;
}

/**
 * Build context from project metrics
 */
async function buildContextFromProject(
  projectId: string,
  startDate: string,
  endDate: string
): Promise<{ context: string; metrics: AggregatedMetrics }> {
  console.log(`[ChatService] Building context for project ${projectId}`);

  // Fetch aggregated metrics
  const metrics = await metricsAggregator.getProjectMetrics(projectId, startDate, endDate);

  // Format metrics as natural language context
  const context = contextFormatter.formatMetricsForContext(metrics);

  return { context, metrics };
}

/**
 * Build context using RAG (Retrieval-Augmented Generation)
 * Retrieves relevant chunks from vector database based on user query
 * Enhanced with historical context for better comparative analysis
 */
async function buildContextWithRAG(
  projectId: string,
  userMessage: string,
  startDate: string,
  endDate: string,
  includeHistory: boolean = true
): Promise<{ context: string; metrics: AggregatedMetrics; usedRAG: boolean }> {
  console.log(`[ChatService] 🔮 Building context with RAG for project ${projectId}`);

  try {
    // Fetch aggregated metrics (we still need this for saving to conversation context)
    const metrics = await metricsAggregator.getProjectMetrics(projectId, startDate, endDate);

    // Check if project needs re-indexing
    const needsIndexing = await ragService.needsReindexing(projectId);

    if (needsIndexing) {
      console.log(`[ChatService] 📊 Project needs indexing, indexing now...`);
      await ragService.indexMetrics(metrics, projectId);
    }

    // Retrieve context with historical data if requested
    if (includeHistory) {
      console.log(`[ChatService] 📚 Retrieving context with historical comparison`);
      const { currentPeriod, historicalPeriod } = await ragService.retrieveContextWithHistory(
        userMessage,
        projectId,
        startDate,
        endDate,
        10, // topK - retrieve more chunks for comprehensive context
        0.65 // minScore
      );

      if (currentPeriod.length === 0 && historicalPeriod.length === 0) {
        console.warn(`[ChatService] ⚠️ No relevant chunks found, falling back to full context`);
        const fallbackContext = contextFormatter.formatMetricsForContext(metrics);
        return { context: fallbackContext, metrics, usedRAG: false };
      }

      // Build comprehensive context from current and historical chunks
      const ragContext = ragService.buildContextWithHistory(currentPeriod, historicalPeriod);

      console.log(`[ChatService] ✅ Built RAG context from ${currentPeriod.length} current + ${historicalPeriod.length} historical chunks`);
      console.log(`[ChatService] 📉 Enhanced context with month-over-month comparison capability`);

      return { context: ragContext, metrics, usedRAG: true };
    } else {
      // Standard retrieval without history
      const relevantChunks = await ragService.retrieveContext(userMessage, projectId, 10, 0.65);

      if (relevantChunks.length === 0) {
        console.warn(`[ChatService] ⚠️ No relevant chunks found, falling back to full context`);
        const fallbackContext = contextFormatter.formatMetricsForContext(metrics);
        return { context: fallbackContext, metrics, usedRAG: false };
      }

      // Build context from retrieved chunks
      const ragContext = ragService.buildContextFromChunks(relevantChunks);

      console.log(`[ChatService] ✅ Built RAG context from ${relevantChunks.length} chunks`);

      return { context: ragContext, metrics, usedRAG: true };
    }
  } catch (error: any) {
    console.error(`[ChatService] ❌ RAG context building failed:`, error.message);
    console.log(`[ChatService] 🔄 Falling back to traditional context building`);

    // Fallback to traditional approach
    const metrics = await metricsAggregator.getProjectMetrics(projectId, startDate, endDate);
    const fallbackContext = contextFormatter.formatMetricsForContext(metrics);
    return { context: fallbackContext, metrics, usedRAG: false };
  }
}

/**
 * Build messages array for OpenAI with comprehensive context
 */
async function buildMessages(
  conversationId: string | undefined,
  userMessage: string,
  contextData: string,
  pageContext?: string,
  userId?: string,
  projectId?: string
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];

  // Build enhanced system prompt with page context
  let systemPrompt = `${OPENAI_CONFIG.systemPrompt}\n\nCurrent Data Context:\n${contextData}`;

  // Add project and user context
  if (projectId && userId) {
    try {
      const Project = (await import('../models/Project')).default;
      const User = (await import('../models/User')).default;

      const [project, user] = await Promise.all([
        Project.findById(projectId).lean(),
        User.findById(userId).lean()
      ]);

      if (project && user) {
        // Build comprehensive project context
        const connectedPlatforms: string[] = [];
        const notConnectedPlatforms: string[] = [];

        const platformChecks = [
          { name: 'Google Analytics', field: project.gaPropertyId, id: project.gaPropertyId },
          { name: 'Google Ads', field: project.googleAdsCustomerId, id: project.googleAdsCustomerId },
          { name: 'Search Console', field: project.searchConsoleSiteUrl, id: project.searchConsoleSiteUrl },
          { name: 'Facebook', field: project.facebookPageId, id: project.facebookPageId },
          { name: 'Meta Ads', field: project.metaAdsAccountId, id: project.metaAdsAccountId },
          { name: 'Instagram', field: project.instagram?.igUserId, id: project.instagram?.igUsername },
          { name: 'YouTube', field: project.youtubeChannelId, id: project.youtubeChannelId },
          { name: 'LinkedIn', field: project.linkedinPageId, id: project.linkedinPageId },
          { name: 'Google Places', field: project.googlePlacesId, id: project.googlePlacesData?.displayName }
        ];

        platformChecks.forEach(({ name, field, id }) => {
          if (field) {
            connectedPlatforms.push(id ? `${name} (${id})` : name);
          } else {
            notConnectedPlatforms.push(name);
          }
        });

        systemPrompt += `\n\n**Project & User Context:**
- **Project Name:** ${project.name}
- **Website:** ${project.websiteUrl}
- **User:** ${user.name} (${user.email})
- **User Role:** ${user.role === 'admin' ? 'Administrator' : 'Hotel Manager'}

**Connected Platforms (${connectedPlatforms.length}/9):**
${connectedPlatforms.map(p => `✅ ${p}`).join('\n')}

${notConnectedPlatforms.length > 0 ? `**Not Connected (${notConnectedPlatforms.length}):**
${notConnectedPlatforms.map(p => `❌ ${p} - Suggest connecting for comprehensive insights`).join('\n')}` : ''}

**Important:** You have full access to data from all connected platforms. Never say "I don't have context" - you have comprehensive marketing data available through the RAG system.`;
      }
    } catch (error) {
      console.error('Error fetching project/user context:', error);
    }
  }

  if (pageContext) {
    const pageContextMap: Record<string, string> = {
      'overview': 'The user is currently viewing the DASHBOARD OVERVIEW page with summary metrics across all platforms.',
      'analytics': 'The user is currently viewing the GOOGLE ANALYTICS page with detailed traffic and user behavior data.',
      'youtube': 'The user is currently viewing the YOUTUBE page with video performance metrics.',
      'facebook': 'The user is currently viewing the FACEBOOK page with page engagement and post performance.',
      'instagram': 'The user is currently viewing the INSTAGRAM page with profile and content metrics.',
      'meta-ads': 'The user is currently viewing the META ADS page with Facebook/Instagram advertising campaign data.',
      'google-ads': 'The user is currently viewing the GOOGLE ADS page with search and display advertising metrics.',
      'search-console': 'The user is currently viewing the SEARCH CONSOLE page with SEO and organic search performance.',
      'linkedin': 'The user is currently viewing the LINKEDIN page with professional network engagement data.'
    };

    const contextInfo = pageContextMap[pageContext] || '';
    if (contextInfo) {
      systemPrompt += `\n\n**Current Page Context:**\n${contextInfo}\nPrioritize information relevant to this page when answering questions.`;
    }
  }

  messages.push({
    role: 'system',
    content: systemPrompt,
  });

  // If conversation exists, fetch recent history
  if (conversationId) {
    const historyMessages = await ChatMessage.find({
      conversationId: new mongoose.Types.ObjectId(conversationId),
    })
      .sort({ timestamp: -1 })
      .limit(OPENAI_CONFIG.maxConversationHistory)
      .lean();

    // Add history in chronological order (oldest first)
    historyMessages.reverse().forEach((msg) => {
      if (msg.role !== 'system') {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    });
  }

  // Add current user message
  messages.push({
    role: 'user',
    content: userMessage,
  });

  return messages;
}

/**
 * Call OpenAI API with error handling and retry logic
 */
async function callOpenAI(messages: ChatMessage[]): Promise<string> {
  // Validate configuration
  const validation = validateOpenAIConfig();
  if (!validation.valid) {
    throw new Error(validation.message || 'OpenAI configuration is invalid');
  }

  // Check token limits
  const tokenCheck = checkTokenLimits(messages, OPENAI_CONFIG.maxTokens);
  if (!tokenCheck.withinLimit) {
    console.warn('[ChatService] Token limit exceeded, truncating messages');
    // Truncate to fit within limits
    const truncatedMessages = truncateMessages(messages, 4000);
    messages = truncatedMessages as ChatMessage[];
  }

  // Log token usage
  console.log(`[ChatService] Estimated tokens: ${tokenCheck.estimatedTokens} total`);

  // Call OpenAI with retry logic
  const response = await retryWithBackoff(async () => {
    const completion = await openai.chat.completions.create({
      model: OPENAI_CONFIG.model,
      messages: messages,
      max_tokens: OPENAI_CONFIG.maxTokens,
      temperature: OPENAI_CONFIG.temperature,
    });

    return completion.choices[0]?.message?.content || '';
  });

  if (!response) {
    throw new Error('OpenAI returned empty response');
  }

  return response;
}

/**
 * Save conversation and messages to database
 */
async function saveConversation(
  userId: string,
  projectId: string,
  conversationId: string | undefined,
  userMessage: string,
  aiResponse: string,
  metrics: AggregatedMetrics
): Promise<{ conversationId: string; messageId: string }> {
  let conversation: IChatConversation;

  // Create or get existing conversation
  if (conversationId) {
    const foundConversation = await ChatConversation.findById(conversationId);
    if (!foundConversation) {
      throw new Error('Conversation not found');
    }
    conversation = foundConversation;
    // Update last message and timestamp
    conversation.lastMessage = userMessage.length > 200 ? userMessage.substring(0, 200) + '...' : userMessage;
    await conversation.save();
  } else {
    // Create new conversation - generate title from first message
    let title = userMessage.trim();
    const maxLength = 50;
    if (title.length > maxLength) {
      title = title.substring(0, maxLength);
      const lastSpace = title.lastIndexOf(' ');
      if (lastSpace > 20) {
        title = title.substring(0, lastSpace);
      }
      title += '...';
    }

    conversation = await ChatConversation.create({
      userId: new mongoose.Types.ObjectId(userId),
      projectId: new mongoose.Types.ObjectId(projectId),
      title,
      lastMessage: userMessage,
    });

    // Save context snapshot for the conversation
    await ChatContext.create({
      conversationId: conversation._id,
      metrics,
      dateRange: {
        startDate: new Date(metrics.dateRange.startDate),
        endDate: new Date(metrics.dateRange.endDate),
      },
    });
  }

  // Save user message
  await ChatMessage.create({
    conversationId: conversation._id,
    userId: new mongoose.Types.ObjectId(userId),
    role: 'user',
    content: userMessage,
    timestamp: new Date(),
  });

  // Save AI response
  const aiMessageDoc = await ChatMessage.create({
    conversationId: conversation._id,
    userId: new mongoose.Types.ObjectId(userId),
    role: 'assistant',
    content: aiResponse,
    timestamp: new Date(),
  });

  return {
    conversationId: conversation._id.toString(),
    messageId: aiMessageDoc._id.toString(),
  };
}

/**
 * Send a message to Avi and get a response
 */
export async function sendMessage(params: SendMessageParams): Promise<SendMessageResponse> {
  const { userId, projectId, message, conversationId, dateRange } = params;

  try {
    console.log(`[ChatService] Processing message for user ${userId}, project ${projectId}`);

    // Determine date range (use provided or default to last 7 days excluding today)
    let endDate: string;
    let startDate: string;

    if (dateRange?.endDate && dateRange?.startDate) {
      endDate = dateRange.endDate;
      startDate = dateRange.startDate;
    } else {
      // Default: last 7 days excluding today
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      endDate = yesterday.toISOString().split('T')[0];

      const sevenDaysAgo = new Date(yesterday);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      startDate = sevenDaysAgo.toISOString().split('T')[0];
    }

    // Build context using RAG (with automatic fallback to traditional approach on error)
    const { context, metrics, usedRAG } = await buildContextWithRAG(
      projectId,
      message,
      startDate,
      endDate
    );

    // Log which approach was used
    if (usedRAG) {
      console.log(`[ChatService] 🎯 Using RAG-based context retrieval`);
    } else {
      console.log(`[ChatService] 📋 Using traditional full context approach`);
    }

    // Build messages array with comprehensive context
    const messages = await buildMessages(
      conversationId,
      message,
      context,
      params.pageContext,
      userId,
      projectId
    );

    // Call OpenAI
    const aiResponse = await callOpenAI(messages);

    // Save conversation and messages
    const { conversationId: savedConversationId, messageId } = await saveConversation(
      userId,
      projectId,
      conversationId,
      message,
      aiResponse,
      metrics
    );

    return {
      conversationId: savedConversationId,
      messageId,
      response: aiResponse,
      metrics,
    };
  } catch (error: any) {
    console.error('[ChatService] Error processing message:', error);

    // Handle OpenAI-specific errors
    const errorMessage = handleOpenAIError(error);
    throw new Error(errorMessage);
  }
}

/**
 * Get conversation history
 */
export async function getConversation(conversationId: string, limit: number = 50): Promise<IChatMessage[]> {
  const messages = await ChatMessage.find({
    conversationId: new mongoose.Types.ObjectId(conversationId),
  })
    .sort({ timestamp: 1 })
    .limit(limit)
    .lean();

  return messages as IChatMessage[];
}

/**
 * Get user's conversations for a project
 */
export async function getUserConversations(
  userId: string,
  projectId?: string,
  limit: number = 10,
  skip: number = 0
): Promise<IChatConversation[]> {
  const query: any = {
    userId: new mongoose.Types.ObjectId(userId),
  };

  if (projectId) {
    query.projectId = new mongoose.Types.ObjectId(projectId);
  }

  const conversations = await ChatConversation.find(query)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();

  return conversations as IChatConversation[];
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
  // Verify ownership
  const conversation = await ChatConversation.findOne({
    _id: new mongoose.Types.ObjectId(conversationId),
    userId: new mongoose.Types.ObjectId(userId),
  });

  if (!conversation) {
    throw new Error('Conversation not found or unauthorized');
  }

  // Delete all messages in the conversation
  await ChatMessage.deleteMany({
    conversationId: new mongoose.Types.ObjectId(conversationId),
  });

  // Delete context snapshots
  await ChatContext.deleteMany({
    conversationId: new mongoose.Types.ObjectId(conversationId),
  });

  // Delete the conversation
  await ChatConversation.deleteOne({ _id: conversation._id });
}

/**
 * Manually re-index project metrics to vector database
 */
export async function reindexProjectMetrics(
  projectId: string,
  startDate: string,
  endDate: string
): Promise<{ success: boolean; chunksIndexed: number }> {
  try {
    console.log(`[ChatService] 🔄 Starting manual re-index for project ${projectId}`);

    // Fetch aggregated metrics
    const metrics = await metricsAggregator.getProjectMetrics(projectId, startDate, endDate);

    // Re-index (will delete old vectors and create new ones)
    await ragService.reindexProject(metrics, projectId);

    // Count chunks created
    const chunks = ragService.chunkMetrics(metrics, projectId);

    console.log(`[ChatService] ✅ Successfully re-indexed project ${projectId} with ${chunks.length} chunks`);

    return {
      success: true,
      chunksIndexed: chunks.length,
    };
  } catch (error: any) {
    console.error(`[ChatService] ❌ Error re-indexing project:`, error.message);
    throw new Error(`Failed to re-index project: ${error.message}`);
  }
}

export default {
  sendMessage,
  getConversation,
  getUserConversations,
  deleteConversation,
  reindexProjectMetrics,
};
