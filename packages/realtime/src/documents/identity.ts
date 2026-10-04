/** Stable per-account colors across browser/native editor sessions. */
export function collaborationColor(accountId: string) {
  let hash = 2166136261;
  for (const character of accountId) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const hue = (hash % 360) / 60;
  const chroma = 0.6;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const channels =
    hue < 1
      ? [chroma, x, 0]
      : hue < 2
        ? [x, chroma, 0]
        : hue < 3
          ? [0, chroma, x]
          : hue < 4
            ? [0, x, chroma]
            : hue < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${channels
    .map((value) =>
      Math.round((value + 0.15) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}
