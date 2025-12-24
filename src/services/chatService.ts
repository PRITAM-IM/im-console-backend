import { ChatMessage, IChatMessage } from '../models/ChatMessage';
import { ChatConversation, IChatConversation } from '../models/ChatConversation';
import { ChatContext } from '../models/ChatContext';
import { AggregatedMetrics } from './metricsAggregator';
import { ENV } from '../config/env';
import mongoose from 'mongoose';
import asyncRagService from './asyncRagService';
import queryIntentParser from './queryIntentParser';

// Lazy load LangChain to prevent memory issues during initialization
let ChatOpenAI: any;
let HumanMessage: any;
let AIMessage: any;
let SystemMessage: any;
let ToolMessage: any;
let allAgentTools: any[] | null = null;

async function loadLangChainDependencies() {
  if (ChatOpenAI && allAgentTools) return; // Already loaded

  console.log('[ChatService] 🔄 Loading LangChain dependencies...');

  // Load LangChain modules in parallel (using modern API)
  const [openai, messages] = await Promise.all([
    import('@langchain/openai'),
    import('@langchain/core/messages'),
  ]);

  ChatOpenAI = openai.ChatOpenAI;
  HumanMessage = messages.HumanMessage;
  AIMessage = messages.AIMessage;
  SystemMessage = messages.SystemMessage;
  ToolMessage = messages.ToolMessage;

  // Load tools using factory function
  const { default: createAllAgentTools } = await import('../tools');
  allAgentTools = await createAllAgentTools();

  console.log('[ChatService] ✅ LangChain dependencies loaded with', allAgentTools.length, 'tools');
}

/**
 * Agentic RAG Chat Service
 * 
 * Refactored from linear RAG pipeline to Agentic RAG using LangChain.js and OpenAI Tool Calling.
 * 
 * **Architecture:**
 * - Agent decides which tools to call based on user query
 * - Platform tools for quantitative queries (e.g., "What was the CPC for Google Ads yesterday?")
 * - Milvus tool for qualitative queries (e.g., "What are my ROAS preferences?")
 * - Time parsing tool for relative date conversion
 * 
 * **Key Benefits:**
 * - Eliminates "context not found" errors by proactively fetching data
 * - Supports parallel tool calling for multi-platform queries
 * - Maintains conversation history through LangChain memory
 */

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
  toolsUsed?: string[];
}

/**
 * Get default date range (last 7 days)
 */
function getDefaultDateRange(): { startDate: string; endDate: string } {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // Yesterday
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6); // 7 days ago

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

/**
 * Build the Avi system prompt with enhanced tool-calling instructions
 */
function buildAviSystemPrompt(
  projectId: string,
  userId: string,
  connectedPlatforms: string[],
  notConnectedPlatforms: string[],
  pageContext?: string
): string {
  // Get current date in a clear format
  const today = new Date();
  const currentDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentDateReadable = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const basePrompt = `You are Avi, an expert AI marketing analyst and data consultant for hotel and hospitality businesses.

**IMPORTANT - Current Date Information:**
- Today's Date: ${currentDateReadable}
- Today in ISO format: ${currentDate}
- When the user asks about "yesterday", "last week", "last month", etc., calculate from TODAY (${currentDate})
- Default date range (if user doesn't specify): Last 7 days (${getDefaultDateRange().startDate} to ${getDefaultDateRange().endDate})

**Your Personality:**
- Professional yet friendly and approachable
- Data-driven but explain insights in plain language
- Proactive in suggesting optimizations and opportunities
- Honest about limitations and data availability

**Your Capabilities:**
You have access to powerful tools that can fetch real-time data from 9 marketing platforms:
1. Google Analytics (GA4) - Website traffic and behavior
2. Google Ads - Paid search advertising
3. Meta Ads - Facebook/Instagram paid advertising
4. Search Console - Organic search/SEO performance
5. Facebook - Organic page engagement (followers, likes, reach)
6. Instagram - Organic profile metrics
7. YouTube - Video performance
8. LinkedIn - Professional network engagement
9. Google Places - Hotel/business details, ratings, reviews (NO date filter needed)

**MANDATORY Tool Usage Rules:**

**RULE 1: ALWAYS USE TOOLS FOR DATA**
- When user asks about ANY platform (Facebook, Instagram, Google Analytics, etc.), you MUST call the corresponding tool
- NEVER make assumptions or say "no data available" without actually calling the tool first
- NEVER respond based on cached knowledge - ALWAYS fetch fresh data

**RULE 2: Date Handling**
- Use time_parsing_tool FIRST for relative dates ("yesterday", "last week", "7 days ago")
- Default date range if not specified: Last 7 days (${getDefaultDateRange().startDate} to ${getDefaultDateRange().endDate})
- Google Places tool does NOT need dates - it returns current business info

**RULE 3: Call the RIGHT tool**
- "Facebook insights/data/metrics" → facebook_tool (NOT meta_ads_tool)
- "Instagram organic/followers" → instagram_tool (NOT meta_ads_tool)
- "Facebook ads/Meta ads" → meta_ads_tool
- "Hotel details/reviews/rating" → google_places_tool
- "SEO/organic search/keywords" → search_console_tool

**Examples of CORRECT tool usage:**
- "Check facebook insights" → facebook_tool with last 7 days dates
- "Show my hotel reviews" → google_places_tool (no dates needed)
- "How is Instagram doing?" → instagram_tool with last 7 days dates
- "Search Console data" → search_console_tool with last 7 days dates

**Critical Rules:**
1. NEVER say "I don't have data" without calling the tool first
2. ALWAYS call the platform tool to get REAL data
3. If a tool returns an error, acknowledge it and explain the issue
4. When comparing platforms, use parallel tool calls

**Connected Platforms (${connectedPlatforms.length}/9):**
${connectedPlatforms.map(p => `✅ ${p}`).join('\n')}

${notConnectedPlatforms.length > 0 ? `**Not Connected (${notConnectedPlatforms.length}):**
${notConnectedPlatforms.map(p => `❌ ${p} - Suggest connecting for comprehensive insights`).join('\n')}` : ''}

**Current Context:**
- Project ID: ${projectId}
- User ID: ${userId}
${pageContext ? `- Current Page: ${pageContext}` : ''}

**Response Style:**
- Start with a direct answer to the user's question
- Include relevant numbers with context (e.g., "Your CPC was ₹250, which is 15% lower than last month")
- Highlight trends (up/down arrows: ↑ ↓)
- End with 1-2 actionable recommendations
- Use emojis sparingly for visual appeal (📊 📈 📉 💡 ⚠️)

**Currency Format:**
- ALWAYS use Indian Rupees (INR) for all monetary values
- Format: ₹1,000 or ₹1.5K or ₹2.5M (use ₹ symbol, not $ or USD)
- This application is for Indian hotels only - never use dollars or other currencies

Remember: You're not just reporting data - you're a strategic advisor helping them grow their business.`;

  return basePrompt;
}

/**
 * Get connected and not connected platforms for a project
 */
async function getProjectPlatforms(projectId: string): Promise<{ connected: string[]; notConnected: string[] }> {
  try {
    const Project = (await import('../models/Project')).default;
    const project = await Project.findById(projectId).lean();

    if (!project) {
      return { connected: [], notConnected: [] };
    }

    const connectedPlatforms: string[] = [];
    const notConnectedPlatforms: string[] = [];

    const platformChecks = [
      { name: 'Google Analytics', field: project.gaPropertyId },
      { name: 'Google Ads', field: project.googleAdsCustomerId },
      { name: 'Meta Ads', field: project.metaAdsAccountId },
      { name: 'Search Console', field: project.searchConsoleSiteUrl },
      { name: 'Facebook', field: project.facebookPageId },
      { name: 'Instagram', field: project.instagram?.igUserId },
      { name: 'YouTube', field: project.youtubeChannelId },
      { name: 'LinkedIn', field: project.linkedinPageId },
      { name: 'Google Places', field: project.googlePlacesId },
    ];

    platformChecks.forEach(({ name, field }) => {
      if (field) {
        connectedPlatforms.push(name);
      } else {
        notConnectedPlatforms.push(name);
      }
    });

    return { connected: connectedPlatforms, notConnected: notConnectedPlatforms };
  } catch (error) {
    console.error('[ChatService] Error fetching project platforms:', error);
    return { connected: [], notConnected: [] };
  }
}

/**
 * Build chat history as LangChain message array from MongoDB conversation
 */
async function buildChatHistory(conversationId: string | undefined): Promise<any[]> {
  const history: any[] = [];

  if (!conversationId) {
    return history;
  }

  try {
    const messages = await ChatMessage.find({
      conversationId: new mongoose.Types.ObjectId(conversationId),
    })
      .sort({ timestamp: 1 })
      .limit(10) // Last 10 messages for context
      .lean();

    for (const msg of messages) {
      if (msg.role === 'user') {
        history.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        history.push(new AIMessage(msg.content));
      }
    }
  } catch (error) {
    console.error('[ChatService] Error building chat history:', error);
  }

  return history;
}

/**
 * Save conversation and messages to MongoDB
 */
async function saveConversation(
  userId: string,
  projectId: string,
  conversationId: string | undefined,
  userMessage: string,
  aiResponse: string
): Promise<{ conversationId: string; messageId: string }> {
  let conversation: IChatConversation;

  // Create or get existing conversation
  if (conversationId) {
    const foundConversation = await ChatConversation.findById(conversationId);
    if (!foundConversation) {
      throw new Error('Conversation not found');
    }
    conversation = foundConversation;
    conversation.lastMessage = userMessage.length > 200 ? userMessage.substring(0, 200) + '...' : userMessage;
    await conversation.save();
  } else {
    // Create new conversation
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
 * Handle user corrections for self-learning
 */
async function handleUserCorrection(
  userId: string,
  projectId: string,
  message: string
): Promise<void> {
  try {
    const correction = queryIntentParser.detectUserCorrection(message);

    if (correction.isCorrection && correction.instruction) {
      console.log(`[ChatService] 🧠 Detected user ${correction.correctionType}: "${message.substring(0, 50)}..."`);

      await asyncRagService.storeUserCorrection(
        userId,
        projectId,
        message,
        correction.instruction,
        correction.correctionType || 'preference'
      );
    }
  } catch (error) {
    console.warn('[ChatService] Failed to store user correction:', error);
  }
}

/**
 * Execute tool calls and return results
 * Automatically injects projectId and userId since LLM doesn't know these values
 */
async function executeToolCalls(
  toolCalls: any[],
  projectId: string,
  userId: string
): Promise<any[]> {
  const toolResults: any[] = [];

  // Get default date range for tools that need dates
  const defaultDates = getDefaultDateRange();

  for (const toolCall of toolCalls) {
    const tool = allAgentTools!.find((t: any) => t.name === toolCall.name);
    if (tool) {
      try {
        // Inject projectId and userId into args, and provide default dates if not specified
        const enrichedArgs = {
          ...toolCall.args,
          projectId: toolCall.args.projectId || projectId,
          userId: toolCall.args.userId || userId,
          startDate: toolCall.args.startDate || defaultDates.startDate,
          endDate: toolCall.args.endDate || defaultDates.endDate,
        };

        console.log(`[ChatService] 🔧 Executing tool: ${toolCall.name} with args:`, JSON.stringify(enrichedArgs));
        const result = await tool.func(enrichedArgs);
        console.log(`[ChatService] 🔧 Tool result for ${toolCall.name}:`, result.substring(0, 200) + '...');

        toolResults.push(new ToolMessage({
          content: result,
          tool_call_id: toolCall.id,
          name: toolCall.name,
        }));
      } catch (error: any) {
        console.error(`[ChatService] ❌ Tool error for ${toolCall.name}:`, error.message);
        toolResults.push(new ToolMessage({
          content: JSON.stringify({ error: error.message }),
          tool_call_id: toolCall.id,
          name: toolCall.name,
        }));
      }
    }
  }

  return toolResults;
}

/**
 * Send a message to Avi using Agentic RAG with bindTools (modern LangChain API)
 */
export async function sendMessage(params: SendMessageParams): Promise<SendMessageResponse> {
  const { userId, projectId, message, conversationId, pageContext } = params;
  const requestStartTime = Date.now();

  try {
    console.log(`[ChatService] 🤖 Processing agentic message for user ${userId}, project ${projectId}`);

    // Lazy load LangChain dependencies
    await loadLangChainDependencies();

    // Get project platforms
    const { connected, notConnected } = await getProjectPlatforms(projectId);

    // Build system prompt
    const systemPrompt = buildAviSystemPrompt(projectId, userId, connected, notConnected, pageContext);

    // Build chat history
    const chatHistory = await buildChatHistory(conversationId);

    // Initialize the LLM with tool binding (modern LangChain approach)
    const llm = new ChatOpenAI({
      modelName: ENV.OPENAI_MODEL || 'gpt-4o',
      temperature: 0.7,
      openAIApiKey: ENV.OPENAI_API_KEY,
      maxTokens: 2000,
    });

    // Bind tools to the model
    const llmWithTools = llm.bindTools(allAgentTools);

    // Build messages array
    let messages: any[] = [
      new SystemMessage(systemPrompt),
      ...chatHistory,
      new HumanMessage(message),
    ];

    const toolsUsed: string[] = [];
    let finalResponse = '';
    let iterations = 0;
    const maxIterations = 5;

    // Tool calling loop
    console.log(`[ChatService] 🚀 Executing agent with ${allAgentTools!.length} tools available`);

    while (iterations < maxIterations) {
      iterations++;

      // Call the model
      const response = await llmWithTools.invoke(messages);

      // Check if the model wants to call tools
      const toolCalls = response.tool_calls || [];

      if (toolCalls.length === 0) {
        // No more tool calls, we have our final response
        finalResponse = response.content as string;
        break;
      }

      // Log tools being called
      for (const tc of toolCalls) {
        toolsUsed.push(tc.name);
        console.log(`[ChatService] 🔧 Tool call: ${tc.name}`);
      }

      // Add the assistant's response (with tool calls) to messages
      messages.push(response);

      // Execute all tool calls with injected projectId and userId
      const toolResults = await executeToolCalls(toolCalls, projectId, userId);

      // Add tool results to messages
      messages.push(...toolResults);
    }

    if (!finalResponse && iterations >= maxIterations) {
      finalResponse = "I apologize, but I couldn't complete the request within the allowed iterations. Please try a simpler query.";
    }

    console.log(`[ChatService] 🔧 Tools used: ${toolsUsed.join(', ') || 'none'}`);

    // Handle user corrections (async, non-blocking)
    handleUserCorrection(userId, projectId, message).catch(() => { });

    // Save conversation
    const { conversationId: savedConversationId, messageId } = await saveConversation(
      userId,
      projectId,
      conversationId,
      message,
      finalResponse
    );

    const totalLatency = Date.now() - requestStartTime;
    console.log(`[ChatService] ✅ Agentic response completed in ${totalLatency}ms`);

    return {
      conversationId: savedConversationId,
      messageId,
      response: finalResponse,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
    };
  } catch (error: any) {
    console.error('[ChatService] ❌ Error processing agentic message:', error);
    throw new Error(`Failed to process message: ${error.message}`);
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
  const conversation = await ChatConversation.findOne({
    _id: new mongoose.Types.ObjectId(conversationId),
    userId: new mongoose.Types.ObjectId(userId),
  });

  if (!conversation) {
    throw new Error('Conversation not found or unauthorized');
  }

  await ChatMessage.deleteMany({
    conversationId: new mongoose.Types.ObjectId(conversationId),
  });

  await ChatContext.deleteMany({
    conversationId: new mongoose.Types.ObjectId(conversationId),
  });

  await ChatConversation.deleteOne({ _id: conversation._id });
}

export default {
  sendMessage,
  getConversation,
  getUserConversations,
  deleteConversation,
};
