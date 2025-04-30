export function joinPath(...paths: string[]) {
  // join paths with "/" and removes duplicate "/"
  // e.g. ["base", "params"] => "base/params"
  return paths.join('/').replace(/\/{1,}/g, '/');
}

export function popPath(path: string) {
  // parse badly formatted path
  const parsedPath = joinPath(path).trim();

  const indexOfLast = parsedPath.lastIndexOf('/');

  // guard: empty path or empty string or top-level path (index = 0)
  if (parsedPath === '/' || parsedPath === '' || indexOfLast === 0) return '/';

  if (indexOfLast === parsedPath.length - 1) {
    // trailing slash, therefore remove trailing slash and continue pop
    return popPath(parsedPath.slice(0, indexOfLast));
  }

  return parsedPath.slice(0, indexOfLast);
}
