/* global RequestInit */
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
const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000; // 1 second

/**
 * A helper function to perform fetch requests with retry logic.
 * @param url The URL to fetch.
 * @param options The request options.
 * @returns A promise that resolves to the Response object.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      // Handle non-ok responses as retryable errors
      const errorBody = await response.json().catch(() => ({}));
      const errorMessage =
        errorBody?.error?.message || `HTTP error! status: ${response.status}`;
      throw new Error(errorMessage);
    } catch (error) {
      lastError = error as Error;
      logger.warn(
        `Fetch attempt ${attempt + 1}/${MAX_RETRIES} failed for ${
          new URL(url).pathname
        }`,
        {
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      if (attempt < MAX_RETRIES - 1) {
        const delay = INITIAL_DELAY * Math.pow(2, attempt);
        const jitter = delay * 0.2 * (Math.random() - 0.5); // +/- 10% jitter
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      }
    }
  }
  const finalError = new Error(
    `Failed to fetch ${
      new URL(url).pathname
    } after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
  logger.error(finalError.message, finalError);
  throw finalError;
}

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
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}/models`, {
        method: 'GET',
        headers: this.#headers,
      });

      const jsonResponse = await response.json();
      logger.info('Successfully fetched models from OpenRouter.');
      // The models are in the 'data' property of the response object
      return jsonResponse.data as OpenRouterModel[];
    } catch (error) {
      logger.error('Failed to fetch models after all retries', error, {
        endpoint: '/models',
      });
      throw error; // Re-throw the final error
    }
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

    try {
      const response = await fetchWithRetry(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: this.#headers,
        body: JSON.stringify(payload),
      });

      const jsonResponse =
        (await response.json()) as OpenRouterChatCompletionResponse;

      if (
        !jsonResponse.choices ||
        jsonResponse.choices.length === 0 ||
        !jsonResponse.choices[0].message?.content
      ) {
        const error = new Error(
          'Invalid response structure from OpenRouter API.'
        );
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
    } catch (error) {
      logger.error(
        'Chat completion failed after all retries',
        error as Error,
        {
          endpoint: '/chat/completions',
        }
      );
      throw error; // Re-throw the final error
    } finally {
      // 2. Clean up the header for subsequent requests that might be GET.
      this.#headers.delete('Content-Type');
    }
  }
}