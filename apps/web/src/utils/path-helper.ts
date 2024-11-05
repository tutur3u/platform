export function joinPath(...paths: string[]) {
  // join paths with "/" and removes duplicate "/"
  // e.g. ["base", "params"] => "base/params"
  return paths.join('/').replace(/\/{1,}/g, '/');
}

export function popPath(path: string) {
  // parse badly formatted path
  const parsedPath = joinPath(path);

  const indexOfLast = parsedPath.lastIndexOf('/');

  // guard: empty path (index of / is 1) or empty string (index of / is 0 = none)
  if (indexOfLast <= 1) return parsedPath;

  if (indexOfLast === parsedPath.length - 1) {
    // trailing slash, therefore remove trailing slash and continue pop
    return popPath(parsedPath.slice(0, indexOfLast));
  }

  return parsedPath.slice(0, indexOfLast);
}
