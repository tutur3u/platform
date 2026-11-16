/** Remove browser fragments before loadMailPage serializes its input. */
export function mailLoaderPath(href: string) {
  const fragment = href.indexOf('#');
  return fragment < 0 ? href : href.slice(0, fragment);
}
