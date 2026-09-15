'use client';
/** Link email addresses without interpreting untrusted message text as HTML. */
export function MailEmailText({ text }: { text: string }) {
  const pattern =
    /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/giu;
  const pieces = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    pieces.push(text.slice(cursor, match.index));
    pieces.push(
      <a
        key={match.index}
        href={`mailto:${match[0]}`}
        className="text-dynamic-blue underline-offset-2 hover:underline focus-visible:underline"
      >
        {match[0]}
      </a>
    );
    cursor = match.index + match[0].length;
  }
  pieces.push(text.slice(cursor));
  return pieces;
}
