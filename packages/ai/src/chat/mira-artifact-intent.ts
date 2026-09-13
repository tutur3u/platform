import type { ModelMessage } from 'ai';

/** Route explicit product presentation to native panels, including follow-ups. */
export function shouldPresentWorkspaceArtifact(
  messages: ModelMessage[]
): boolean {
  const userTexts = messages
    .filter((message) => message.role === 'user')
    .map((message) =>
      (typeof message.content === 'string'
        ? message.content
        : message.content
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join(' ')
      )
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
    );
  const latest = userTexts.at(-1) ?? '';
  if (
    /\b(don't (?:show|open|display|present)|do not (?:show|open|display|present)|without (?:an? )?(?:artifact|panel)|text only|chat only|how (do|can|to))\b|\bkhong\b/u.test(
      latest
    )
  )
    return false;
  const product =
    /\b(tasks?|calendar|schedule|agenda|finances?|wallets?|transactions?|meetings?|cong viec|lich|tai chinh|cuoc hop)\b/u;
  const present =
    /\b(show|display|present|open|view|see|hien thi|cho (toi|minh) xem|mo)\b/u;
  if (present.test(latest) && product.test(latest)) return true;
  return (
    /\b(artifact|panel)\b/u.test(latest) &&
    (present.test(latest) || /\b(should|instead)\b/u.test(latest)) &&
    userTexts.slice(-4).some((text) => product.test(text))
  );
}
