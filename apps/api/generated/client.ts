// Generated from openapi.json. Run bun run --cwd apps/api generate.
export class ApiClient {
  constructor(private readonly origin: string, private readonly request: (input: URL, init: RequestInit) => Promise<Response> = fetch) {}
  async getHealth(query: Record<string, never> = {}): Promise<{ "status": "ok" }> {
    const url = new URL("/api/health", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getBuildInfo(query: Record<string, never> = {}): Promise<{ "appName": string; "version": string; "builtAt": string; "commitHash": string; "commitMessage": string; "deploymentStamp": string | null; "deploymentUrl": string | null; "environment": string; "refName": string; "shortCommitHash": string }> {
    const url = new URL("/api/build-info", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getMobileVersion(query: { platform: "ios" | "android"; build: string }): Promise<{ "platform": "ios" | "android"; "currentBuild": number; "minimumSupportedBuild": number; "latestBuild": number; "storeUrl": string; "requiresUpdate": boolean; "shouldUpdate": boolean; "status": "supported" | "update-recommended" | "update-required" }> {
    const url = new URL("/api/v1/mobile/version", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
}
