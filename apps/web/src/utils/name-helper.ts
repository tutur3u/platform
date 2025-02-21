const articles = new Set(['van', 'von', 'der', 'den', 'de', 'la', 'les', 'le']);

export const getInitials = (name?: string | null): string => {
  if (!name) return '';

  // Replace tabs and newlines with spaces and trim
  const cleanName = name.replace(/[\t\n]/g, ' ').trim();
  if (!cleanName) return '';

  // Split by spaces, hyphens, and apostrophes
  let nameParts = cleanName.split(/[\s\-']+/).filter(Boolean);
  if (nameParts.length === 0) return '';

  // For single word names
  if (nameParts.length === 1) {
    return nameParts[0]!.charAt(0).toUpperCase();
  }

  const firstPart = nameParts[0]!.toLowerCase();

  // Special case: if the name starts with a capitalized prefix like "Van", use it
  if (nameParts[0]![0]?.toUpperCase() === nameParts[0]![0]) {
    return (
      nameParts[0]![0]! + nameParts[nameParts.length - 1]![0]
    ).toUpperCase();
  }

  // Otherwise look for the first non-prefix word and last word
  if (articles.has(firstPart)) {
    const lastPart = nameParts[nameParts.length - 1]!;
    return (nameParts[1] ? nameParts[1][0] : '') + lastPart[0]!.toUpperCase();
  }

  // Otherwise use first and last word
  return (
    (nameParts?.[0]?.[0] ?? '') + (nameParts?.[nameParts.length - 1]?.[0] ?? '')
  ).toUpperCase();
};
