function field(tag: string, value: string) {
  if (value.length > 99) throw new RangeError('QR field is too long');
  return tag + String(value.length).padStart(2, '0') + value;
}

/** CRC-16/CCITT-FALSE for an ASCII EMV QR payload. */
export function vietQrChecksum(value: string) {
  let crc = 0xffff;
  for (const character of value) {
    crc ^= character.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** NAPAS 247 account-transfer QR. The bank app enters the amount. */
export function createVietQr(bankBin: string, accountNumber: string) {
  if (
    !/^[0-9]{6}$/.test(bankBin) ||
    !/^[0-9A-Za-z]{4,30}$/.test(accountNumber)
  ) {
    throw new RangeError('Invalid bank BIN or account number');
  }

  const recipient = field('00', bankBin) + field('01', accountNumber);
  const napas =
    field('00', 'A000000727') +
    field('01', recipient) +
    field('02', 'QRIBFTTA');
  const content =
    field('00', '01') +
    field('01', '11') +
    field('38', napas) +
    field('53', '704') +
    field('58', 'VN') +
    '6304';
  return content + vietQrChecksum(content);
}
