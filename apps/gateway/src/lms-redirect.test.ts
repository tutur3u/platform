import { describe, expect, it } from 'vitest';
import { lmsRedirectDestination } from './lms-redirect';

describe('LMS legacy routes', () => {
  it.each([
    ['teach.tuturuuu.com/', '/lms/teach'],
    ['learn.tuturuuu.com/', '/lms/learn'],
    ['lms.tuturuuu.com/', '/lms'],
    ['tuturuuu.com/teach', '/lms/teach'],
    ['tuturuuu.com/learn/', '/lms/learn'],
    [
      'teach.tuturuuu.com/vi/w/courses/c/lesson',
      '/lms/teach/vi/w/courses/c/lesson',
    ],
    [
      'tuturuuu.com/teach/w/education/quiz-sets/q',
      '/lms/teach/w/education/quiz-sets/q',
    ],
    ['learn.tuturuuu.com/en/parent-invite', '/lms/learn/en/parent-invite'],
    [
      'tuturuuu.com/learn/w/courses/x%2Fy/tests/t',
      '/lms/learn/w/courses/x%2Fy/tests/t',
    ],
    ['lms.tuturuuu.com/learn/w/marks', '/lms/learn/w/marks'],
    ['lms.tuturuuu.com/lms/teach/w', '/lms/teach/w'],
    ['lms.tuturuuu.com//evil.example', '/lms//evil.example'],
  ])('maps %s to %s with the exact query', (from, suffix) => {
    const query = '?x=1&x=2&q=a%2fb&token=';
    const destination = lmsRedirectDestination(
      new Request(`https://${from}${query}`, { method: 'HEAD' })
    );
    expect(destination?.href).toBe(`https://tuturuuu.com${suffix}${query}`);
  });

  it.each([
    'tuturuuu.com/lms',
    'tuturuuu.com/teacher',
    'tuturuuu.com/learning',
    'teach.tuturuuu.com.example.org/w',
    'teach.tuturuuu.com:444/w',
  ])('leaves %s alone', (from) => {
    expect(lmsRedirectDestination(new Request(`https://${from}`))).toBeNull();
  });

  it('leaves POST requests on their established endpoint', () => {
    expect(
      lmsRedirectDestination(
        new Request('https://teach.tuturuuu.com/w/attendance', {
          method: 'POST',
        })
      )
    ).toBeNull();
  });
});
