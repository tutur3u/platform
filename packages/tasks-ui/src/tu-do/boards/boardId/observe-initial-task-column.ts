/** Load the first page on visibility, with a fallback for unsupported browsers. */
export function observeInitialTaskColumn(
  element: Element,
  load: () => Promise<unknown>
) {
  const request = () => {
    void load().catch(() => {});
  };
  if (typeof IntersectionObserver === 'undefined') {
    request();
    return;
  }
  let active = true;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!active || !entry?.isIntersecting) return;
      active = false;
      observer.disconnect();
      request();
    },
    { rootMargin: '200px' }
  );
  observer.observe(element);
  return () => {
    active = false;
    observer.disconnect();
  };
}
