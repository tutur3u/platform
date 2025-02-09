export function joinPath(...paths: string[]) {
  // join paths with "/" and removes duplicate "/"
  // e.g. ["base", "params"] => "base/params"
  return paths.join('/').replace(/\/{1,}/g, '/');
}
