// 1. Import the AttributionConfig type for type safety.
import { AttributionConfig } from '../../shared/types';

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
  public async getModels(): Promise<unknown> {
    // TODO: Implement the fetch call to the /models endpoint in I5.T4.
    console.log(`Fetching models from ${API_BASE_URL}/models...`);
    // For now, returning a resolved promise with an empty array.
    return Promise.resolve([]);
  }

  /**
   * Creates a chat completion using the specified model and messages.
   * @returns A promise that resolves to the chat completion response.
   */
  public async createChatCompletion(): Promise<unknown> {
    // TODO: Implement the fetch call to the /chat/completions endpoint in a later task.
    console.log('Creating chat completion...');
    // For now, returning a resolved promise.
    return Promise.resolve({});
  }
}