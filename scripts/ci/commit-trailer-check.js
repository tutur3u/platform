const fs = require('node:fs');

const TRAILER_KEY = /^([A-Za-z0-9-]+):[ \t]+\S.*$/u;

/** Trailer keys in the final trailer block, from bottom to top. */
function trailerKeys(message) {
  const lines = String(message).replace(/\r\n/gu, '\n').split('\n');
  let index = lines.length - 1;
  while (index >= 0 && lines[index].trim() === '') index -= 1;
  const keys = [];
  while (index >= 0) {
    const line = lines[index];
    if (line.trim() === '') break;
    if (/^[ \t]/u.test(line)) {
      index -= 1;
      continue;
    }
    const match = TRAILER_KEY.exec(line);
    if (!match) break;
    keys.push(match[1]);
    index -= 1;
  }
  return keys;
}

function hasCoauthoredBy(message) {
  return trailerKeys(message).some(
    (key) => key.toLowerCase() === 'co-authored-by'
  );
}

function commitMessagesFrom(raw) {
  return String(raw)
    .split('\0')
    .filter((message) => message.length > 0);
}

function checkMessages(messages) {
  if (messages.length === 0) {
    return {
      status: 1,
      error: 'No PR commit messages were provided.',
    };
  }
  const commits = [];
  messages.forEach((message, index) => {
    if (hasCoauthoredBy(message)) commits.push(index + 1);
  });
  if (commits.length === 0) return { status: 0, error: '' };
  return {
    status: 1,
    error: `Co-authored-by trailer is not allowed on PR commit ${commits.join(', ')}.`,
  };
}

function main(raw = fs.readFileSync(0, 'utf8')) {
  const result = checkMessages(commitMessagesFrom(raw));
  if (result.error) console.error(result.error);
  return result.status;
}

module.exports = {
  checkMessages,
  commitMessagesFrom,
  hasCoauthoredBy,
  trailerKeys,
};

if (require.main === module) process.exit(main());
