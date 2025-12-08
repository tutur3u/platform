/**
 * Error classes for the Tuturuuu SDK
 */

import type { ApiErrorResponse } from './types';

/**
 * Base error class for all SDK errors
 */
export class TuturuuuError extends Error {
  public readonly code?: string;
  public readonly statusCode?: number;

  constructor(message: string, code?: string, statusCode?: number) {
    super(message);
    this.name = 'TuturuuuError';
    this.code = code;
    this.statusCode = statusCode;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends TuturuuuError {
  constructor(message: string, code?: string) {
    super(message, code, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends TuturuuuError {
  constructor(message: string, code?: string) {
    super(message, code, 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends TuturuuuError {
  constructor(message: string, code?: string) {
    super(message, code, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Bad request error (400)
 */
export class BadRequestError extends TuturuuuError {
  constructor(message: string, code?: string) {
    super(message, code, 400);
    this.name = 'BadRequestError';
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends TuturuuuError {
  constructor(message: string, code?: string) {
    super(message, code, 409);
    this.name = 'ConflictError';
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends TuturuuuError {
  /** Number of seconds to wait before retrying (from Retry-After header) */
  public readonly retryAfter?: number;
  /** Unix timestamp when the rate limit resets (from X-RateLimit-Reset header) */
  public readonly resetTime?: number;

  constructor(
    message: string,
    options?: {
      code?: string;
      retryAfter?: number;
      resetTime?: number;
    }
  ) {
    super(message, options?.code, 429);
    this.name = 'RateLimitError';
    this.retryAfter = options?.retryAfter;
    this.resetTime = options?.resetTime;
  }
}

/**
 * Internal server error (500)
 */
export class InternalServerError extends TuturuuuError {
  constructor(message: string, code?: string) {
    super(message, code, 500);
    this.name = 'InternalServerError';
  }
}

/**
 * Network error
 */
export class NetworkError extends TuturuuuError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends TuturuuuError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

/**
 * Options for creating a rate limit error from response headers
 */
export interface RateLimitHeaders {
  retryAfter?: string | null;
  resetTime?: string | null;
}

/**
 * Helper function to create appropriate error from API response
 */
export function createErrorFromResponse(
  response: ApiErrorResponse,
  statusCode: number,
  rateLimitHeaders?: RateLimitHeaders
): TuturuuuError {
  const { message, code } = response;

  switch (statusCode) {
    case 400:
      return new BadRequestError(message, code);
    case 401:
      return new AuthenticationError(message, code);
    case 403:
      return new AuthorizationError(message, code);
    case 404:
      return new NotFoundError(message, code);
    case 409:
      return new ConflictError(message, code);
    case 429:
      return new RateLimitError(message, {
        code,
        retryAfter: parseIntSafe(rateLimitHeaders?.retryAfter),
        resetTime: parseIntSafe(rateLimitHeaders?.resetTime),
      });
    case 500:
    case 502:
    case 503:
    case 504:
      return new InternalServerError(message, code);
    default:
      return new TuturuuuError(message, code, statusCode);
  }
}

/**
 * Safely parse a string to integer, returning undefined for invalid values
 */
function parseIntSafe(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? undefined : parsed;
}

/**
 * Type guard to check if an object is an ApiErrorResponse
 */
export function isApiErrorResponse(obj: unknown): obj is ApiErrorResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'error' in obj &&
    'message' in obj &&
    typeof (obj as any).error === 'string' &&
    typeof (obj as any).message === 'string'
  );
}
