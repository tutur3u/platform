/** The query key for the caller's room Mira state in one meeting. */
export const roomMiraConsentKey = (meetingId: string) => [
  'room-mira-consent',
  meetingId,
];

/** Every surface's Mira choice for one meeting shares this mutation key. */
export const roomMiraChoiceKey = (meetingId: string) => [
  'room-mira-choice',
  meetingId,
];
