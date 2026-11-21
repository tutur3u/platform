// Reads a sensitive value (an external ID such as a phone number) without it
// reaching argv, shell history or the terminal echo. Piped standard input is
// read whole; an interactive terminal gets a prompt on stderr with echo off.

type InputStream = NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void };

async function readPiped(stdin: InputStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    if (chunks.reduce((size, part) => size + part.length, 0) > 4096)
      throw new Error('Input is too long.');
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

function readHidden(stdin: InputStream, prompt: string) {
  return new Promise<string>((resolve, reject) => {
    process.stderr.write(prompt);
    stdin.setRawMode?.(true);
    stdin.resume();
    let value = '';
    const finish = (error?: Error) => {
      stdin.setRawMode?.(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stderr.write('\n');
      if (error) reject(error);
      else resolve(value.trim());
    };
    const onData = (data: Buffer | string) => {
      for (const char of data.toString('utf8')) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003') return finish(new Error('Cancelled.'));
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
        if (value.length > 320) return finish(new Error('Input is too long.'));
      }
    };
    stdin.on('data', onData);
  });
}

export async function readSensitiveValue(
  prompt: string,
  stdin: InputStream = process.stdin
) {
  const value = stdin.isTTY
    ? await readHidden(stdin, prompt)
    : await readPiped(stdin);
  if (!value) throw new Error('No value was provided.');
  return value;
}

// Shows only the last three characters of a decrypted display value, and none
// of a value too short to hide the rest.
export function maskDisplay(value: string | null | undefined) {
  if (!value) return '-';
  const visible = value.length > 6 ? value.slice(-3) : '';
  return `${'*'.repeat(Math.min(8, value.length - visible.length))}${visible}`;
}
