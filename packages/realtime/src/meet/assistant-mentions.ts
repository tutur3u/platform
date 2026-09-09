export const MEET_ASSISTANT_USER_ID = '00000000-0000-4000-8000-000000000001';

/** Shared standalone handle boundaries for rendering and assistant requests. */
export function findMeetAssistantMentions(text: string) {
  return [
    ...text.matchAll(/(^|[\s([{"'“‘,:;!?*])(@tuturuuu)(?![\p{L}\p{N}_-])/giu),
  ].map((match) => ({
    start: match.index + match[1]!.length,
    end: match.index + match[0].length,
  }));
}

export function hasMeetAssistantMention(text: string) {
  return findMeetAssistantMentions(text).length > 0;
}
