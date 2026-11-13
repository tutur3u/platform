export interface LiveTranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  complete: boolean;
  interrupted?: boolean;
}

export function appendLiveTranscript(
  entries: LiveTranscriptEntry[],
  role: LiveTranscriptEntry['role'],
  text: string,
  id: string
): LiveTranscriptEntry[] {
  if (!text) return entries;
  const last = entries.at(-1);
  if (last?.role === role && !last.complete) {
    return [
      ...entries.slice(0, -1),
      { ...last, text: (last.text + text).slice(-24000) },
    ];
  }
  return [
    ...entries.slice(-199).map((entry) => ({ ...entry, complete: true })),
    { id, role, text: text.slice(-24000), complete: false },
  ];
}

export function finishLiveTranscript(
  entries: LiveTranscriptEntry[],
  interrupted = false
): LiveTranscriptEntry[] {
  return entries.map((entry) =>
    entry.complete
      ? entry
      : {
          ...entry,
          complete: true,
          interrupted: interrupted && entry.role === 'assistant',
        }
  );
}
