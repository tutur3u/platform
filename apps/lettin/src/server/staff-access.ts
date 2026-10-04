export const isTuturuuuStaffEmail = (email: string | null) =>
  !!email && /^[^@\s]+@tuturuuu\.com$/i.test(email);
