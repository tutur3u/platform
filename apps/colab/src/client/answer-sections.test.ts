import { describe, expect, it } from 'vitest';
import { answerSections, sectionTitle } from './answer-sections';

describe('readable agent deliverables', () => {
  it('unpacks the production bilingual payload without escaped JSON punctuation', () => {
    const sections = answerSections(
      JSON.stringify({
        english_caption: 'Join RISE!\nReview first.',
        vietnamese_caption: 'Tham gia RISE!',
        source_notes: ['Brief v2'],
        readiness_checklist: { human_reviewer: 'Club lead' },
      })
    );
    expect(sections?.[0]).toEqual({
      key: 'english_caption',
      content: 'Join RISE!\nReview first.',
    });
    expect(sections?.[2]?.content).toBe('- Brief v2');
    expect(sections?.[3]?.content).toContain('**Human reviewer:** Club lead');
    expect(sectionTitle('english_caption')).toBe('English caption');
  });
  it('preserves non-JSON and incomplete output for ordinary Markdown rendering', () => {
    for (const answer of [
      '# Draft\n\nText',
      '{"unfinished":',
      'null',
      '[]',
      '{}',
    ])
      expect(answerSections(answer)).toBeNull();
  });
  it('accepts fenced objects and preserves HTML as text for safe rendering', () => {
    expect(
      answerSections(
        '```json\n{"caption":"<script>alert(1)</script>"}\n```'
      )?.[0]?.content
    ).toBe('<script>alert(1)</script>');
  });
});
