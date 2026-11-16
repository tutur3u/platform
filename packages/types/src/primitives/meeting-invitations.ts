export type MeetingGuest = {
  email: string;
  name?: string;
  optional?: boolean;
};

export type MeetingInvitationInput = {
  guests: MeetingGuest[];
  timeZone: string;
};
