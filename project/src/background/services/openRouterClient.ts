// 1. Import the AttributionConfig type for type safety.
import { AttributionConfig, OpenRouterModel } from '../../shared/types';

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
    const response = await fetch(`${API_BASE_URL}/models`, {
      method: 'GET',
      headers: this.#headers,
    });

    if (!response.ok) {
      // Try to parse the error response from OpenRouter, but don't fail if it's not JSON
      const errorBody = await response.json().catch(() => ({}));
      const errorMessage =
        errorBody?.error?.message || `HTTP error! status: ${response.status}`;
      throw new Error(`Failed to fetch models: ${errorMessage}`);
    }

    const jsonResponse = await response.json();
    // The models are in the 'data' property of the response object
    return jsonResponse.data as OpenRouterModel[];
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