/**
 * API Service Layer
 * Provides centralized error handling for external API calls
 */

import type { ApiErrorResponse } from "../types/api.types.js";

export class ApiService {
  /**
   * Fetch data from an external API with standardized error handling
   * @param request - The fetch request to execute
   * @param errorContext - Context string for logging errors
   * @returns Object containing either data or error
   */
  static async fetchWithErrorHandling<T>(
    request: Request,
    errorContext: string
  ): Promise<{ data: T } | { error: ApiErrorResponse; status: number }> {
    try {
      const response = await fetch(request);

      if (!response.ok) {
        return {
          error: {
            error: "ExternalApiError",
            message: `External API failed: ${response.status} ${response.statusText}`,
          },
          status: 502,
        };
      }

      const data = await response.json();
      return { data };
    } catch (err) {
      console.error(`${errorContext}:`, err);
      return {
        error: {
          error: "InternalServerError",
          message: String(err),
        },
        status: 500,
      };
    }
  }
}
