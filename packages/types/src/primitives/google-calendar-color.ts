export type GoogleProviderColorChoice = { connectionId: string } & (
  | { kind: 'inherit'; id?: null }
  | { kind: 'event' | 'label'; id: string }
);
export type GoogleProviderColorOption = {
  kind: 'inherit' | 'event' | 'label';
  id: string | null;
  name: string | null;
  background: string;
  foreground: string | null;
};
export type GoogleProviderColorOptions = {
  provider: 'google';
  connectionId: string;
  calendarId: string;
  sourceColor: { background: string; foreground: string | null };
  options: GoogleProviderColorOption[];
};
