import { addressParser, decodeWords } from 'postal-mime';

/** Recover encoded header bytes before discarding an already-corrupted display name. */
function repairEncodedWords(value: string) {
  if (!decodeWords(value).includes('\uFFFD')) return value;
  return value.replace(
    /=\?(utf-?8)\?([bq])\?([^?]*)\?=/giu,
    (word, _charset: string, encoding: string, text: string) => {
      try {
        const bytes =
          encoding.toLowerCase() === 'b'
            ? Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
            : Uint8Array.from(
                text
                  .replaceAll('_', ' ')
                  .replace(/=([a-f0-9]{2})/giu, (_, hex: string) =>
                    String.fromCharCode(Number.parseInt(hex, 16))
                  ),
                (char) => char.charCodeAt(0)
              );
        try {
          new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          return word;
        } catch {
          // Some senders label Latin-1 Q/B bytes as UTF-8 (e.g. Kh=E1nh H=E0).
          return word.replace(/utf-?8/iu, 'windows-1252');
        }
      } catch {
        return word;
      }
    }
  );
}

function repairHeaderCharset(value: string) {
  // Keep valid adjacent words together: an encoded UTF-8 character can span words.
  return value.replace(
    /=\?[^?]+\?[bq]\?[^?]*\?=(?:\s+=\?[^?]+\?[bq]\?[^?]*\?=)*/giu,
    (words) => repairEncodedWords(words)
  );
}

export function decodeMailHeader(value: string) {
  return decodeWords(repairHeaderCharset(value)).normalize('NFC');
}

export function mailDisplayName(
  name: string | null | undefined,
  address: string,
  header?: string
) {
  if (header) {
    const parsed = addressParser(repairHeaderCharset(header));
    const addresses = parsed.flatMap((entry) =>
      'group' in entry ? (entry.group ?? []) : [entry]
    );
    const match = addresses.find(
      (entry) => entry.address?.toLowerCase() === address.toLowerCase()
    );
    if (match?.name && !match.name.includes('\uFFFD'))
      return match.name.normalize('NFC');
  }
  const decoded = name ? decodeMailHeader(name).trim() : '';
  return decoded && !decoded.includes('\uFFFD') ? decoded : null;
}
