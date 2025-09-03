// 1. Import the AttributionConfig type for type safety.
import {
  AttributionConfig,
  OpenRouterModel,
  ChatCompletionRequestPayload,
  OpenRouterChatCompletionResponse,
} from '../../shared/types';
import { logger } from '../logger';

// 2. Define the base URL for the OpenRouter API as a constant.
const API_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * A client for interacting with the OpenRouter API.
 * It handles authentication and attribution headers for all requests.
 */
export class OpenRouterClient {
  // 3. Use private fields to store the API key and prepared headers.
  #apiKey: string;
  #headers: Headers;

  /**
   * Creates an instance of the OpenRouterClient.
   * @param apiKey The user's OpenRouter API key.
   * @param attribution The attribution configuration for API requests.
   */
  constructor(apiKey: string, attribution: AttributionConfig) {
    // 4. Store the API key.
    this.#apiKey = apiKey;

    // 5. Prepare the common headers that will be sent with every request.
    this.#headers = new Headers();
    this.#headers.append('Authorization', `Bearer ${this.#apiKey}`);
    this.#headers.append('HTTP-Referer', attribution.httpReferer);
    this.#headers.append('X-Title', attribution.xTitle);
  }

  /**
   * Fetches the list of available models from OpenRouter.
   * @returns A promise that resolves to the list of models.
   */
  public async getModels(): Promise<OpenRouterModel[]> {
    logger.info('Fetching models from OpenRouter.');
    const response = await fetch(`${API_BASE_URL}/models`, {
      method: 'GET',
      headers: this.#headers,
    });

    if (!response.ok) {
      // Try to parse the error response from OpenRouter, but don't fail if it's not JSON
      const errorBody = await response.json().catch(() => ({}));
      const errorMessage =
        errorBody?.error?.message || `HTTP error! status: ${response.status}`;
      const error = new Error(`Failed to fetch models: ${errorMessage}`);
      logger.error('OpenRouter API request failed', error, {
        endpoint: '/models',
        status: response.status,
      });
      throw error;
    }

    const jsonResponse = await response.json();
    logger.info('Successfully fetched models from OpenRouter.');
    // The models are in the 'data' property of the response object
    return jsonResponse.data as OpenRouterModel[];
  }

  /**
   * Creates a chat completion using the specified model and messages.
   * @param payload The request payload containing the model, messages, and other parameters.
   * @returns A promise that resolves to the AI-generated reply string.
   */
  public async createChatCompletion(
    payload: ChatCompletionRequestPayload
  ): Promise<string> {
    logger.info('Requesting chat completion from OpenRouter', {
      model: payload.model,
    });
    // 1. Append the Content-Type header for the POST request.
    this.#headers.append('Content-Type', 'application/json');

    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: this.#headers,
      body: JSON.stringify(payload),
    });

    // 2. Clean up the header for subsequent requests that might be GET.
    this.#headers.delete('Content-Type');

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMessage =
        errorBody?.error?.message || `HTTP error! status: ${response.status}`;
      const error = new Error(`Chat completion failed: ${errorMessage}`);
      logger.error('OpenRouter API request failed', error, {
        endpoint: '/chat/completions',
        status: response.status,
      });
      throw error;
    }

    const jsonResponse =
      (await response.json()) as OpenRouterChatCompletionResponse;

    if (
      !jsonResponse.choices ||
      jsonResponse.choices.length === 0 ||
      !jsonResponse.choices[0].message?.content
    ) {
      const error = new Error('Invalid response structure from OpenRouter API.');
      logger.error(error.message, error, { response: jsonResponse });
      throw error;
    }

    const replyText = jsonResponse.choices[0].message.content.trim();
    logger.info('Successfully received chat completion from OpenRouter.', {
      model: payload.model,
      replyLength: replyText.length,
    });
    // 3. Return the content of the first message choice.
    return replyText;
  }
}