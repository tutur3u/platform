export function buildInvoiceSearchOrQuery(q: string) {
  const trimmed = q.trim();
  if (!trimmed) return '';

  return `notice.ilike.%${trimmed}%,note.ilike.%${trimmed}%,customer.full_name.ilike.%${trimmed}%`;
}
