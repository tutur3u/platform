export const getInitials = (name?: string): string => {
  if (!name) return '';
  const names = name.trim().toUpperCase().split(' ');
  if (names.length === 1) return names[0]!.charAt(0);
  return names[0]!.charAt(0) + names[names.length - 1]!.charAt(0);
};
