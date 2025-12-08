import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  AuthorizationError,
  BadRequestError,
  ConflictError,
  createErrorFromResponse,
  InternalServerError,
  isApiErrorResponse,
  NetworkError,
  NotFoundError,
  RateLimitError,
  TuturuuuError,
  ValidationError,
} from './errors';
import type { ApiErrorResponse } from './types';

describe('TuturuuuError', () => {
  it('should create error with message', () => {
    const error = new TuturuuuError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('TuturuuuError');
    expect(error.code).toBeUndefined();
    expect(error.statusCode).toBeUndefined();
  });

  it('should create error with code and status', () => {
    const error = new TuturuuuError('Test error', 'TEST_CODE', 400);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.statusCode).toBe(400);
  });

  it('should maintain proper stack trace', () => {
    const error = new TuturuuuError('Test error');
    expect(error.stack).toBeDefined();
  });
});

describe('AuthenticationError', () => {
  it('should create 401 error', () => {
    const error = new AuthenticationError('Invalid credentials');
    expect(error.message).toBe('Invalid credentials');
    expect(error.name).toBe('AuthenticationError');
    expect(error.statusCode).toBe(401);
  });

  it('should accept error code', () => {
    const error = new AuthenticationError('Invalid token', 'INVALID_TOKEN');
    expect(error.code).toBe('INVALID_TOKEN');
  });
});

describe('AuthorizationError', () => {
  it('should create 403 error', () => {
    const error = new AuthorizationError('Access denied');
    expect(error.message).toBe('Access denied');
    expect(error.name).toBe('AuthorizationError');
    expect(error.statusCode).toBe(403);
  });
});

describe('NotFoundError', () => {
  it('should create 404 error', () => {
    const error = new NotFoundError('Resource not found');
    expect(error.message).toBe('Resource not found');
    expect(error.name).toBe('NotFoundError');
    expect(error.statusCode).toBe(404);
  });
});

describe('BadRequestError', () => {
  it('should create 400 error', () => {
    const error = new BadRequestError('Invalid request');
    expect(error.message).toBe('Invalid request');
    expect(error.name).toBe('BadRequestError');
    expect(error.statusCode).toBe(400);
  });
});

describe('ConflictError', () => {
  it('should create 409 error', () => {
    const error = new ConflictError('Resource conflict');
    expect(error.message).toBe('Resource conflict');
    expect(error.name).toBe('ConflictError');
    expect(error.statusCode).toBe(409);
  });
});

describe('RateLimitError', () => {
  it('should create 429 error', () => {
    const error = new RateLimitError('Too many requests');
    expect(error.message).toBe('Too many requests');
    expect(error.name).toBe('RateLimitError');
    expect(error.statusCode).toBe(429);
  });

  it('should create error with retry metadata', () => {
    const error = new RateLimitError('Rate limit exceeded', {
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 60,
      resetTime: 1699999999,
    });
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(error.statusCode).toBe(429);
    expect(error.retryAfter).toBe(60);
    expect(error.resetTime).toBe(1699999999);
  });

  it('should allow undefined retry metadata', () => {
    const error = new RateLimitError('Rate limit exceeded', {
      code: 'RATE_LIMIT_EXCEEDED',
    });
    expect(error.retryAfter).toBeUndefined();
    expect(error.resetTime).toBeUndefined();
  });
});

describe('InternalServerError', () => {
  it('should create 500 error', () => {
    const error = new InternalServerError('Server error');
    expect(error.message).toBe('Server error');
    expect(error.name).toBe('InternalServerError');
    expect(error.statusCode).toBe(500);
  });
});

describe('NetworkError', () => {
  it('should create network error', () => {
    const error = new NetworkError('Connection failed');
    expect(error.message).toBe('Connection failed');
    expect(error.name).toBe('NetworkError');
    expect(error.code).toBe('NETWORK_ERROR');
  });
});

describe('ValidationError', () => {
  it('should create validation error', () => {
    const error = new ValidationError('Invalid input');
    expect(error.message).toBe('Invalid input');
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
  });
});

describe('createErrorFromResponse', () => {
  it('should create BadRequestError for 400', () => {
    const response: ApiErrorResponse = {
      error: 'Bad Request',
      message: 'Invalid parameters',
      code: 'INVALID_PARAMS',
    };
    const error = createErrorFromResponse(response, 400);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toBe('Invalid parameters');
    expect(error.code).toBe('INVALID_PARAMS');
  });

  it('should create AuthenticationError for 401', () => {
    const response: ApiErrorResponse = {
      error: 'Unauthorized',
      message: 'Invalid API key',
    };
    const error = createErrorFromResponse(response, 401);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.message).toBe('Invalid API key');
  });

  it('should create AuthorizationError for 403', () => {
    const response: ApiErrorResponse = {
      error: 'Forbidden',
      message: 'Insufficient permissions',
    };
    const error = createErrorFromResponse(response, 403);
    expect(error).toBeInstanceOf(AuthorizationError);
  });

  it('should create NotFoundError for 404', () => {
    const response: ApiErrorResponse = {
      error: 'Not Found',
      message: 'Resource does not exist',
    };
    const error = createErrorFromResponse(response, 404);
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('should create ConflictError for 409', () => {
    const response: ApiErrorResponse = {
      error: 'Conflict',
      message: 'Resource already exists',
    };
    const error = createErrorFromResponse(response, 409);
    expect(error).toBeInstanceOf(ConflictError);
  });

  it('should create RateLimitError for 429', () => {
    const response: ApiErrorResponse = {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
    };
    const error = createErrorFromResponse(response, 429);
    expect(error).toBeInstanceOf(RateLimitError);
  });

  it('should create RateLimitError for 429 with rate limit headers', () => {
    const response: ApiErrorResponse = {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
    };
    const error = createErrorFromResponse(response, 429, {
      retryAfter: '60',
      resetTime: '1699999999',
    });
    expect(error).toBeInstanceOf(RateLimitError);
    const rateLimitError = error as RateLimitError;
    expect(rateLimitError.retryAfter).toBe(60);
    expect(rateLimitError.resetTime).toBe(1699999999);
  });

  it('should handle null rate limit headers', () => {
    const response: ApiErrorResponse = {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
    };
    const error = createErrorFromResponse(response, 429, {
      retryAfter: null,
      resetTime: null,
    });
    expect(error).toBeInstanceOf(RateLimitError);
    const rateLimitError = error as RateLimitError;
    expect(rateLimitError.retryAfter).toBeUndefined();
    expect(rateLimitError.resetTime).toBeUndefined();
  });

  it('should handle invalid rate limit header values', () => {
    const response: ApiErrorResponse = {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
    };
    const error = createErrorFromResponse(response, 429, {
      retryAfter: 'invalid',
      resetTime: '-100',
    });
    expect(error).toBeInstanceOf(RateLimitError);
    const rateLimitError = error as RateLimitError;
    expect(rateLimitError.retryAfter).toBeUndefined();
    expect(rateLimitError.resetTime).toBeUndefined();
  });

  it('should create InternalServerError for 500', () => {
    const response: ApiErrorResponse = {
      error: 'Internal Server Error',
      message: 'Something went wrong',
    };
    const error = createErrorFromResponse(response, 500);
    expect(error).toBeInstanceOf(InternalServerError);
  });

  it('should create InternalServerError for 502', () => {
    const response: ApiErrorResponse = {
      error: 'Bad Gateway',
      message: 'Gateway error',
    };
    const error = createErrorFromResponse(response, 502);
    expect(error).toBeInstanceOf(InternalServerError);
  });

  it('should create InternalServerError for 503', () => {
    const response: ApiErrorResponse = {
      error: 'Service Unavailable',
      message: 'Service temporarily unavailable',
    };
    const error = createErrorFromResponse(response, 503);
    expect(error).toBeInstanceOf(InternalServerError);
  });

  it('should create InternalServerError for 504', () => {
    const response: ApiErrorResponse = {
      error: 'Gateway Timeout',
      message: 'Gateway timeout',
    };
    const error = createErrorFromResponse(response, 504);
    expect(error).toBeInstanceOf(InternalServerError);
  });

  it('should create generic TuturuuuError for unknown status codes', () => {
    const response: ApiErrorResponse = {
      error: 'Unknown',
      message: 'Unknown error',
      code: 'UNKNOWN',
    };
    const error = createErrorFromResponse(response, 418);
    expect(error).toBeInstanceOf(TuturuuuError);
    expect(error.message).toBe('Unknown error');
    expect(error.statusCode).toBe(418);
  });
});

describe('isApiErrorResponse', () => {
  it('should return true for valid ApiErrorResponse', () => {
    const response = {
      error: 'Error',
      message: 'Error message',
    };
    expect(isApiErrorResponse(response)).toBe(true);
  });

  it('should return true for ApiErrorResponse with code', () => {
    const response = {
      error: 'Error',
      message: 'Error message',
      code: 'ERROR_CODE',
    };
    expect(isApiErrorResponse(response)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isApiErrorResponse(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isApiErrorResponse(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isApiErrorResponse('string')).toBe(false);
    expect(isApiErrorResponse(123)).toBe(false);
    expect(isApiErrorResponse(true)).toBe(false);
  });

  it('should return false for object without error property', () => {
    expect(isApiErrorResponse({ message: 'test' })).toBe(false);
  });

  it('should return false for object without message property', () => {
    expect(isApiErrorResponse({ error: 'test' })).toBe(false);
  });

  it('should return false for empty object', () => {
    expect(isApiErrorResponse({})).toBe(false);
  });
});
