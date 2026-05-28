import { describe, expect, it } from 'vitest';
import { renderTopicAnnouncementEmail } from './topic-announcements-email';

describe('renderTopicAnnouncementEmail', () => {
  it('escapes HTML and preserves message line breaks', () => {
    const email = renderTopicAnnouncementEmail({
      announcement: {
        body: null,
        title: 'Safety <briefing>',
        topic: 'Line one <script>\nLine two & more',
      },
      workspaceName: 'Demo Workspace',
    });

    expect(email.subject).toBe('Safety <briefing>');
    expect(email.html).toContain('Safety &lt;briefing&gt;');
    expect(email.html).toContain(
      'Line one &lt;script&gt;<br />Line two &amp; more'
    );
    expect(email.text).toContain('Line one <script>\nLine two & more');
  });

  it('renders class details, workspace footer, and attachment summaries', () => {
    const email = renderTopicAnnouncementEmail({
      announcement: {
        body: 'Bring the handout.',
        class_label: 'HUONG-EGET1',
        day_label: 'Saturday',
        end_time: '18:00:00',
        place: 'CENTER 1',
        room: '6',
        session_date: '2026-06-01',
        start_time: '16:30:00',
        title: 'Unit 3 speaking practice',
        topic: 'Practice speaking about weekend plans.',
      },
      attachments: [
        {
          contentType: 'application/pdf',
          fileName: '1314c279-8f86-4674-83e4-811190d22166-lesson-plan.pdf',
          sizeBytes: 1536,
        },
      ],
      workspaceName: 'Demo Workspace',
    });

    expect(email.html).toContain('HUONG-EGET1');
    expect(email.html).toContain('16:30 - 18:00');
    expect(email.html).toContain('CENTER 1');
    expect(email.html).toContain('lesson-plan.pdf');
    expect(email.html).not.toContain('1314c279-8f86-4674-83e4-811190d22166');
    expect(email.html).toContain('Demo Workspace');
    expect(email.html).toContain('Tuturuuu has not scanned this email');
    expect(email.html).not.toContain('Tuturuuu Topic Announcement');
    expect(email.html).not.toContain('through Tuturuuu');
    expect(email.text).toContain('Class: HUONG-EGET1');
    expect(email.text).toContain('Attachments:\n- lesson-plan.pdf (2 KB)');
    expect(email.text).toContain('Sent by Demo Workspace.');
    expect(email.text).toContain('only proceed at your own risk');
  });

  it('falls back to a neutral workspace label', () => {
    const email = renderTopicAnnouncementEmail({
      announcement: {
        body: '',
        title: 'Announcement',
        topic: 'Topic body',
      },
      workspaceName: null,
    });

    expect(email.html).toContain(
      'Sent by <strong style="color:#0f172a">your workspace team</strong>'
    );
    expect(email.text).toContain('Sent by your workspace team.');
    expect(email.text).toContain(
      'This message and any attachments were added by a member of the workspace'
    );
  });
});
