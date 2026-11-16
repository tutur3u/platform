export function publicBoundary(
  request: Request,
  env: { PLATFORM_BUILD_COMMIT_HASH?: string }
): Response | null;
export function mountRootUrl(request: Request): string | null;
