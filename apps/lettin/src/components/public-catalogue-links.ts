export function catalogueQuery({
  page,
  search,
  tag,
}: {
  page?: number;
  search?: string;
  tag?: string;
}) {
  const query = new URLSearchParams();
  if (page && page > 1) query.set('page', String(page));
  if (search) query.set('q', search);
  if (tag) query.set('tag', tag);
  const value = query.toString();
  return value ? `?${value}` : '?';
}
