import { apiConfig } from '@/lib/config/api';

export type ApiError = {
  message: string;
  status: number;
  retryAfter?: number;
};

export type ApiResult<T> = {
  data?: T;
  error?: ApiError;
};

const buildUrl = (path: string) => `${apiConfig.baseUrl}${path}`;

export async function postJson<T>(
  path: string,
  body: unknown
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let parsed: (T & { error?: string; retryAfter?: number }) | undefined;

    if (text) {
      try {
        parsed = JSON.parse(text) as T & {
          error?: string;
          retryAfter?: number;
        };
      } catch {
        parsed = undefined;
      }
    }

    if (!response.ok) {
      return {
        error: {
          message: parsed?.error || 'Request failed',
          status: response.status,
          retryAfter: parsed?.retryAfter,
        },
      };
    }

    return { data: parsed as T };
  } catch (error) {
    return {
      error: {
        message: error instanceof Error ? error.message : 'Network error',
        status: 0,
      },
    };
  }
}
