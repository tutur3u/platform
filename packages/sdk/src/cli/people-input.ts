// Reads a sensitive value (an external ID such as a phone number) without it
// reaching argv, shell history or the terminal echo. Piped standard input is
// read whole; an interactive terminal gets a prompt on stderr with echo off.

type InputStream = NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void };

const MAX_PIPED_BYTES = 4096;
const MAX_TYPED_CHARS = 320;

async function readPiped(stdin: InputStream) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stdin) {
    const part = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += part.length;
    if (size > MAX_PIPED_BYTES) throw new Error('Input is too long.');
    chunks.push(part);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

function readHidden(stdin: InputStream, prompt: string) {
  // Without raw mode the terminal would echo the value.
  if (typeof stdin.setRawMode !== 'function')
    return Promise.reject(
      new Error('Cannot hide input on this terminal; pipe the value on stdin.')
    );
  const setRawMode = stdin.setRawMode.bind(stdin);
  return new Promise<string>((resolve, reject) => {
    let value = '';
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      stdin.off('data', onData);
      stdin.off('end', onEnd);
      stdin.off('error', onError);
      try {
        setRawMode(false);
      } finally {
        stdin.pause();
        process.stderr.write('\n');
        if (error) reject(error);
        else resolve(value.trim());
      }
    };
    const onEnd = () => finish(new Error('Cancelled.'));
    const onError = (error: Error) => finish(error);
    const onData = (data: Buffer | string) => {
      try {
        for (const char of data.toString('utf8')) {
          if (char === '\r' || char === '\n') return finish();
          if (char === '\u0003' || char === '\u0004')
            return finish(new Error('Cancelled.'));
          if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
          else if (char >= ' ') value += char;
          if (value.length > MAX_TYPED_CHARS)
            return finish(new Error('Input is too long.'));
        }
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Input failed.'));
      }
    };
    try {
      process.stderr.write(prompt);
      setRawMode(true);
      stdin.on('data', onData);
      stdin.once('end', onEnd);
      stdin.once('error', onError);
      stdin.resume();
    } catch (error) {
      finish(error instanceof Error ? error : new Error('Input failed.'));
    }
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

// Replaces every identity's display value with its masked form, so JSON output
// follows the same rule as text output.
export function maskPersonDisplays<
  T extends { identities?: { displayValue: string | null }[] },
>(person: T): T {
  return {
    ...person,
    identities: person.identities?.map((identity) => ({
      ...identity,
      displayValue:
        identity.displayValue === null
          ? null
          : maskDisplay(identity.displayValue),
    })),
  };
}
