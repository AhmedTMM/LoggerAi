/**
 * OpenRouter AI Client Configuration
 *
 * This module provides a centralized OpenRouter client using the OpenAI SDK.
 * OpenRouter offers a unified API to access multiple AI models including:
 * - Google Gemini
 * - Anthropic Claude
 * - OpenAI GPT
 * - Meta Llama
 * - And many more
 *
 * @see https://openrouter.ai/docs
 */

import OpenAI from 'openai';

// Model constants - Using OpenRouter's model IDs
// These can be easily swapped to other providers (Claude, GPT, etc.)
export const OPENROUTER_MODELS = {
  // Fast model for quick classifications and simple tasks
  FAST: 'google/gemini-flash-1.5',
  // Pro model for complex analysis and reasoning
  PRO: 'google/gemini-pro-1.5',
  // Alternative models (uncomment to use)
  // FAST: 'anthropic/claude-3-haiku',
  // PRO: 'anthropic/claude-3-5-sonnet',
} as const;

// Legacy model name mappings for backward compatibility
export const MODEL_ALIASES = {
  'gemini-3-flash-preview': OPENROUTER_MODELS.FAST,
  'gemini-3-pro-preview': OPENROUTER_MODELS.PRO,
  'gemini-flash': OPENROUTER_MODELS.FAST,
  'gemini-pro': OPENROUTER_MODELS.PRO,
} as const;

/**
 * Get the OpenRouter client instance
 * Lazily initialized to avoid issues during build time
 */
let openRouterClient: OpenAI | null = null;

export function getOpenRouterClient(): OpenAI {
  if (!openRouterClient) {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error('Missing OPENROUTER_API_KEY environment variable');
    }

    openRouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3001',
        'X-Title': 'Aviation Intelligence',
      },
    });
  }

  return openRouterClient;
}

/**
 * Check if OpenRouter is configured
 */
export function isOpenRouterConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/**
 * Resolve model alias to OpenRouter model ID
 */
export function resolveModel(modelNameOrAlias: string): string {
  return MODEL_ALIASES[modelNameOrAlias as keyof typeof MODEL_ALIASES] || modelNameOrAlias;
}

/**
 * Generate a chat completion using OpenRouter
 * This is the primary method for making AI requests
 */
export async function generateCompletion(options: {
  model?: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}): Promise<string> {
  const {
    model = OPENROUTER_MODELS.FAST,
    systemPrompt,
    userPrompt,
    temperature = 0.1,
    maxTokens = 16384,
    responseFormat = 'text',
  } = options;

  const client = getOpenRouterClient();
  const resolvedModel = resolveModel(model);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push({ role: 'user', content: userPrompt });

  const completion = await client.chat.completions.create({
    model: resolvedModel,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(responseFormat === 'json' && { response_format: { type: 'json_object' } }),
  });

  const responseText = completion.choices[0]?.message?.content || '';
  return responseText;
}

/**
 * Generate a chat completion with image/document input
 * Supports vision-capable models for analyzing PDFs and images
 */
export async function generateVisionCompletion(options: {
  model?: string;
  systemPrompt?: string;
  userPrompt: string;
  imageBase64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const {
    model = OPENROUTER_MODELS.FAST,
    systemPrompt,
    userPrompt,
    imageBase64,
    mimeType,
    temperature = 0.1,
    maxTokens = 65536,
  } = options;

  const client = getOpenRouterClient();
  const resolvedModel = resolveModel(model);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  // Build the user message with text and image
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: userPrompt },
      {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${imageBase64}`,
        },
      },
    ],
  });

  const completion = await client.chat.completions.create({
    model: resolvedModel,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  const responseText = completion.choices[0]?.message?.content || '';
  return responseText;
}

/**
 * Parse JSON from AI response, handling markdown code blocks
 */
export function parseJsonResponse<T = any>(response: string): T {
  // Remove markdown code blocks if present
  const cleaned = response
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  return JSON.parse(cleaned);
}

/**
 * Safe JSON parse with fallback
 */
export function safeParseJson<T = any>(response: string, fallback: T): T {
  try {
    return parseJsonResponse<T>(response);
  } catch {
    console.error('Failed to parse AI JSON response:', response.substring(0, 500));
    return fallback;
  }
}

export default {
  getOpenRouterClient,
  isOpenRouterConfigured,
  resolveModel,
  generateCompletion,
  generateVisionCompletion,
  parseJsonResponse,
  safeParseJson,
  MODELS: OPENROUTER_MODELS,
};
