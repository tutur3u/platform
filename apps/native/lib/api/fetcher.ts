export const createAuthorizedFetcher =
  (accessToken?: string) => async (input: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    return fetch(input, {
      ...init,
      headers,
    });
  };
