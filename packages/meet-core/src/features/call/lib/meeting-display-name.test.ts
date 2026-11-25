import { describe, expect, it } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import vi from '../../../../../../apps/meet/messages/vi.json';
import {
  isStoredDefaultMeetingName,
  meetingDisplayName,
  STORED_DEFAULT_MEETING_NAMES,
} from './meeting-display-name';

const EN_DEFAULT = en.meet.call.untitled_meeting;
const VI_DEFAULT = vi.meet.call.untitled_meeting;

describe('meetingDisplayName', () => {
  it('shows an EN viewer the EN default for a meeting with no title', () => {
    expect(meetingDisplayName(null, EN_DEFAULT)).toBe('Untitled meeting');
    expect(meetingDisplayName(undefined, EN_DEFAULT)).toBe('Untitled meeting');
    expect(meetingDisplayName('   ', EN_DEFAULT)).toBe('Untitled meeting');
  });

  it('shows a VI viewer the VI default for a meeting with no title', () => {
    expect(meetingDisplayName(null, VI_DEFAULT)).toBe('Cuộc họp chưa đặt tên');
    expect(meetingDisplayName('', VI_DEFAULT)).toBe('Cuộc họp chưa đặt tên');
  });

  it('shows a stored legacy VI default in the viewer locale', () => {
    expect(meetingDisplayName('Cuộc họp chưa đặt tên', EN_DEFAULT)).toBe(
      'Untitled meeting'
    );
    expect(meetingDisplayName(' Cuộc họp chưa đặt tên ', EN_DEFAULT)).toBe(
      'Untitled meeting'
    );
    expect(meetingDisplayName('Untitled meeting', VI_DEFAULT)).toBe(
      'Cuộc họp chưa đặt tên'
    );
  });

  it('keeps a chosen title verbatim', () => {
    expect(meetingDisplayName('Lớp 10A1 – Toán', EN_DEFAULT)).toBe(
      'Lớp 10A1 – Toán'
    );
    expect(meetingDisplayName('Untitled meeting notes', VI_DEFAULT)).toBe(
      'Untitled meeting notes'
    );
  });

  it('recognises every default the message bundles ship', () => {
    expect(STORED_DEFAULT_MEETING_NAMES).toEqual(
      expect.arrayContaining([EN_DEFAULT, VI_DEFAULT])
    );
    expect(isStoredDefaultMeetingName(en.meet.meetings.untitled)).toBe(true);
    expect(isStoredDefaultMeetingName(vi.meet.meetings.untitled)).toBe(true);
  });
});
