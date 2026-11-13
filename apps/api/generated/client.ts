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
  async getWorkspaceRoleOptions(query: { page: string; pageSize: string }): Promise<{ "count": number; "data": { "id": string; "name": string }[] }> {
    const url = new URL("/api/v1/workspaces/{wsId}/roles/options", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async listWorkspaceRoles(query: { page: string; pageSize: string; q: string }): Promise<{ "count": number; "data": {  }[] }> {
    const url = new URL("/api/v1/workspaces/{wsId}/roles", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async createWorkspaceRole(query: Record<string, never> = {}): Promise<{ "id": string; "message": string }> {
    const url = new URL("/api/v1/workspaces/{wsId}/roles", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "POST" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getWorkspaceDefaultRole(query: Record<string, never> = {}): Promise<{  }> {
    const url = new URL("/api/v1/workspaces/{wsId}/roles/default", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getWorkspaceRole(query: Record<string, never> = {}): Promise<{  }> {
    const url = new URL("/api/v1/workspaces/{wsId}/roles/{roleId}", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async listWorkspaceRoleMembers(query: Record<string, never> = {}): Promise<{  }[]> {
    const url = new URL("/api/v1/workspaces/{wsId}/roles/{roleId}/members", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getWorkspaceRoleMember(query: Record<string, never> = {}): Promise<{  }> {
    const url = new URL("/api/v1/workspaces/{wsId}/roles/{roleId}/members/{userId}", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async listWorkspaceRoleWallets(query: Record<string, never> = {}): Promise<{  }[]> {
    const url = new URL("/api/v1/workspaces/{wsId}/roles/{roleId}/wallets", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getWorkspaceRoleWallet(query: Record<string, never> = {}): Promise<{  }> {
    const url = new URL("/api/v1/workspaces/{wsId}/roles/{roleId}/wallets/{walletId}", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async listWorkspaceApiKeys(query: { page: string; pageSize: string; q: string }): Promise<{  }[] | { "data": {  }[]; "count": number }> {
    const url = new URL("/api/v1/workspaces/{wsId}/api-keys", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async createWorkspaceApiKey(query: Record<string, never> = {}): Promise<{ "message": string; "key": string; "prefix": string }> {
    const url = new URL("/api/v1/workspaces/{wsId}/api-keys", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "POST" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getWorkspaceApiKeyRoles(query: Record<string, never> = {}): Promise<{  }[]> {
    const url = new URL("/api/v1/workspaces/{wsId}/api-keys/roles", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getWorkspaceApiKey(query: Record<string, never> = {}): Promise<{  }> {
    const url = new URL("/api/v1/workspaces/{wsId}/api-keys/{keyId}", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async rotateWorkspaceApiKey(query: Record<string, never> = {}): Promise<{ "message": string; "key": string }> {
    const url = new URL("/api/v1/workspaces/{wsId}/api-keys/{keyId}/rotate", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "POST" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async listWorkspaceApiKeyUsageLogs(query: Record<string, never> = {}): Promise<{  }[]> {
    const url = new URL("/api/v1/workspaces/{wsId}/api-keys/{keyId}/usage-logs", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async createWorkspaceWhiteboard(query: Record<string, never> = {}): Promise<{ "whiteboard": {  } }> {
    const url = new URL("/api/v1/workspaces/{wsId}/whiteboards", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "POST" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getWorkspaceWhiteboard(query: Record<string, never> = {}): Promise<{ "whiteboard": {  } }> {
    const url = new URL("/api/v1/workspaces/{wsId}/whiteboards/{boardId}", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getWorkspaceWhiteboardImageUrl(query: Record<string, never> = {}): Promise<{  }> {
    const url = new URL("/api/v1/workspaces/{wsId}/whiteboards/{boardId}/image-url", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "POST" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async listWorkspaceWorkforceUsers(query: Record<string, never> = {}): Promise<{  }[]> {
    const url = new URL("/api/v1/workspaces/{wsId}/workforce/users", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getWorkspaceWorkforceUser(query: Record<string, never> = {}): Promise<{  }> {
    const url = new URL("/api/v1/workspaces/{wsId}/workforce/users/{userId}", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async listWorkspaceUserProfileLinks(query: Record<string, never> = {}): Promise<{  }[]> {
    const url = new URL("/api/v1/workspaces/{wsId}/user-profile-links", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async listWorkspaceUserProfileLinkUsers(query: Record<string, never> = {}): Promise<{  }[]> {
    const url = new URL("/api/v1/workspaces/{wsId}/user-profile-links/users", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getWorkspaceUserProfileLink(query: Record<string, never> = {}): Promise<{  }> {
    const url = new URL("/api/v1/workspaces/{wsId}/user-profile-links/{linkId}", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async listWorkspaceProgrammingProblems(query: Record<string, never> = {}): Promise<{  }[]> {
    const url = new URL("/api/v1/workspaces/{wsId}/programming/problems", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getWorkspaceProgrammingProblem(query: Record<string, never> = {}): Promise<{  }> {
    const url = new URL("/api/v1/workspaces/{wsId}/programming/problems/{problemId}", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
  async getWorkspaceDeletedStatus(query: Record<string, never> = {}): Promise<{ "deleted": boolean }> {
    const url = new URL("/api/v1/workspaces/{wsId}/deleted", this.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: "GET" });
    if (!response.ok) throw new Error('API request failed: ' + response.status + '; request ID: ' + response.headers.get('x-request-id'));
    return response.json();
  }
}
