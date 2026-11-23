export type MeetSeoLocale = 'en' | 'vi';

export const MEET_SEO_SITE_NAME = 'Tuturuuu Meet';
/** The only domain label link previews show. */
export const MEET_SEO_DOMAIN_LABEL = 'tuturuuu.com/meet';

export interface MeetSeoCopy {
  /** Browser and share title for rooms with no public details. */
  genericRoomTitle: string;
  genericRoomDescription: string;
  /** `{title}` is the approved public meeting title. */
  publicRoomTitle: string;
  publicRoomDescription: string;
  publicRoomScheduledDescription: string;
  endedRoomDescription: string;
  landingTitle: string;
  landingDescription: string;
  pageTitleSuffix: string;
  card: {
    invited: string;
    ended: string;
    genericTitle: string;
    genericDetail: string;
    landingTitle: string;
    landingDetail: string;
    join: string;
    open: string;
    imageAlt: string;
  };
  months: readonly string[];
  /** `{date}` and `{time}` are filled in by the card builder. */
  scheduledFormat: string;
}

export const MEET_SEO_COPY: Record<MeetSeoLocale, MeetSeoCopy> = {
  en: {
    genericRoomTitle: 'Join a meeting | Tuturuuu Meet',
    genericRoomDescription: 'Join a meeting on Tuturuuu Meet.',
    publicRoomTitle: '{title} | Tuturuuu Meet',
    publicRoomDescription: 'You are invited. Join on Tuturuuu Meet.',
    publicRoomScheduledDescription:
      'Scheduled for {when}. Join on Tuturuuu Meet.',
    endedRoomDescription: 'This meeting has ended.',
    landingTitle: 'Tuturuuu Meet | Meetings with live notes',
    landingDescription:
      'Meet with clear audio, live transcription, and meeting notes connected to Tuturuuu Tasks and Calendar.',
    pageTitleSuffix: 'Tuturuuu Meet',
    card: {
      invited: 'You are invited',
      ended: 'Meeting ended',
      genericTitle: 'Join a meeting',
      genericDetail: 'Open the link to join on Tuturuuu Meet.',
      landingTitle: 'Meetings with live notes',
      landingDetail:
        'Clear audio, live transcription and notes connected to Tasks and Calendar.',
      join: 'Join meeting',
      open: 'Open meeting',
      imageAlt: 'Tuturuuu Meet',
    },
    months: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ],
    scheduledFormat: '{date} · {time} UTC',
  },
  vi: {
    genericRoomTitle: 'Tham gia cuộc họp | Tuturuuu Meet',
    genericRoomDescription: 'Tham gia cuộc họp trên Tuturuuu Meet.',
    publicRoomTitle: '{title} | Tuturuuu Meet',
    publicRoomDescription: 'Bạn được mời. Tham gia trên Tuturuuu Meet.',
    publicRoomScheduledDescription:
      'Lên lịch lúc {when}. Tham gia trên Tuturuuu Meet.',
    endedRoomDescription: 'Cuộc họp này đã kết thúc.',
    landingTitle: 'Tuturuuu Meet | Cuộc họp với ghi chú trực tiếp',
    landingDescription:
      'Họp với âm thanh rõ ràng, chép lời trực tiếp và ghi chú kết nối với Tuturuuu Tasks và Calendar.',
    pageTitleSuffix: 'Tuturuuu Meet',
    card: {
      invited: 'Bạn được mời tham gia',
      ended: 'Cuộc họp đã kết thúc',
      genericTitle: 'Tham gia cuộc họp',
      genericDetail: 'Mở liên kết để tham gia trên Tuturuuu Meet.',
      landingTitle: 'Họp với ghi chú trực tiếp',
      landingDetail:
        'Âm thanh rõ ràng, chép lời trực tiếp và ghi chú kết nối với Tasks và Calendar.',
      join: 'Tham gia cuộc họp',
      open: 'Mở cuộc họp',
      imageAlt: 'Tuturuuu Meet',
    },
    months: [
      'thg 1',
      'thg 2',
      'thg 3',
      'thg 4',
      'thg 5',
      'thg 6',
      'thg 7',
      'thg 8',
      'thg 9',
      'thg 10',
      'thg 11',
      'thg 12',
    ],
    scheduledFormat: '{time} UTC, {date}',
  },
};

export function resolveMeetSeoLocale(
  locale: string | undefined
): MeetSeoLocale {
  return locale === 'vi' ? 'vi' : 'en';
}
