export const removeAccents = (str: string) =>
  str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // specifically replace "đ" with "d" (both lowercase and uppercase)
    // to support Vietnamese characters
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
