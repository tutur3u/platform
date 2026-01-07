export function joinPath(...paths: string[]) {
  if (paths.length === 0) return '/';

  // Clean up paths and filter empty ones
  const validPaths = paths.filter(Boolean).map((p) => p.trim());
  if (validPaths.length === 0) return '/';

  // Track path properties
  const firstPath = validPaths[0];
  const shouldBeRelative =
    firstPath?.startsWith('./') || firstPath?.startsWith('../');
  const shouldStartWithSlash =
    firstPath?.startsWith('/') || firstPath?.startsWith('//');
  const shouldHaveTrailingSlash = paths[paths.length - 1]?.endsWith('/');

  // Process each path segment
  const segments: string[] = [];
  for (const path of validPaths) {
    const parts = path.split('/');
    for (const part of parts) {
      if (part === '.') {
        continue; // Skip "." segments
      }
      if (part) {
        segments.push(part);
      }
    }
  }

  let result = segments.join('/');

  // Handle special cases
  if (!result || result === '/') return '/';

  // Add leading slash for absolute paths
  if (!shouldBeRelative && shouldStartWithSlash) {
    result = `/${result.replace(/^\//, '')}`;
  }

  // Add leading './' if the first path started with './'
  if (shouldBeRelative && firstPath?.startsWith('./')) {
    result = `./${result}`;
  }

  // Add trailing slash if original had one
  if (shouldHaveTrailingSlash && !result.endsWith('/')) {
    result += '/';
  }

  return result;
}

export function popPath(path: string) {
  if (!path) return '/';

  // Clean and normalize the path
  let cleanPath = path.trim().replace(/\/+/g, '/');
  const isRelative = cleanPath.startsWith('./') || cleanPath.startsWith('../');

  // Handle root and empty cases
  if (!cleanPath || cleanPath === '/' || cleanPath === '.') return '/';

  // Remove trailing slashes for processing
  cleanPath = cleanPath.replace(/\/*$/, '');

  // Find last slash
  const lastSlash = cleanPath.lastIndexOf('/');

  // No slash found
  if (lastSlash === -1) {
    if (isRelative) return '.';
    return '/';
  }

  // Get parent path
  let result = cleanPath.slice(0, lastSlash);
  if (!result) return '/';

  // Handle relative paths
  if (isRelative) {
    if (!result.startsWith('./') && !result.startsWith('../')) {
      result = `./${result.replace(/^\/+/, '')}`;
    }
  } else {
    // Ensure leading slash for absolute paths and paths without protocol
    if (!result.includes('://') && !result.startsWith('/')) {
      result = `/${result}`;
    }
  }

  return result;
}
