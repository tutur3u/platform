import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCmsCollectionRedirectHref,
  buildCmsEntryRedirectHref,
  buildCmsRedirectHref,
  buildMailRedirectHref,
  buildQrGeneratorRedirectHref,
  buildVerifyTokenRedirectHref,
  courseBuilderRedirectHref,
  docsRedirectHref,
  educationLibraryRedirectHref,
  meetTogetherCalendarRedirectHref,
  meetTogetherProductRedirectHref,
  pricingRedirectHref,
  workspaceChatRedirectHref,
  workspaceInfrastructureAppCoordinationRedirectHref,
  workspaceMeetPlansRedirectHref,
  workspaceTopicAnnouncementsRedirectHref,
  workspaceUserDatabaseRedirectHref,
} from './redirects';

describe('public redirect helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('preserves the legacy pricing anchor redirect target', () => {
    expect(pricingRedirectHref()).toBe('/?hash-nav=1#pricing');
  });

  it('preserves the legacy docs external redirect target', () => {
    expect(docsRedirectHref()).toBe('https://docs.tuturuuu.com');
  });

  it('preserves the legacy meet-together product redirect target', () => {
    expect(meetTogetherProductRedirectHref()).toBe('/meet-together');
  });

  it('preserves legacy workspace dashboard redirect targets', () => {
    expect(workspaceUserDatabaseRedirectHref('ws-1')).toBe(
      '/ws-1/users/database'
    );
    expect(workspaceChatRedirectHref('ws-1')).toBe('/ws-1/chat');
    expect(workspaceMeetPlansRedirectHref('ws-1')).toBe('/ws-1/meet/plans');
    expect(workspaceTopicAnnouncementsRedirectHref('ws-1')).toBe(
      '/ws-1/users/topic-announcements/announcements'
    );
    expect(workspaceInfrastructureAppCoordinationRedirectHref('ws-1')).toBe(
      '/ws-1/infrastructure/app-coordination'
    );
  });

  it('preserves legacy education permanent redirect targets', () => {
    expect(educationLibraryRedirectHref('ws-1', 'flashcards')).toBe(
      '/ws-1/education/library/flashcards'
    );
    expect(educationLibraryRedirectHref('ws-1', 'quiz-sets')).toBe(
      '/ws-1/education/library/quiz-sets'
    );
    expect(educationLibraryRedirectHref('ws-1', 'quizzes')).toBe(
      '/ws-1/education/library/quizzes'
    );
    expect(courseBuilderRedirectHref('ws-1', 'course-1')).toBe(
      '/ws-1/education/courses/course-1/builder'
    );
  });

  it('preserves the legacy meet-together calendar redirect target', () => {
    expect(meetTogetherCalendarRedirectHref()).toBe('/meet-together');
    expect(meetTogetherCalendarRedirectHref('plans/summer')).toBe(
      '/meet-together/plans/summer'
    );
    expect(meetTogetherCalendarRedirectHref('/plans/summer/')).toBe(
      '/meet-together/plans/summer'
    );
  });

  it('redirects the QR generator to the QR app origin and preserves query entries', () => {
    vi.stubEnv('QR_APP_URL', 'https://qr.example.com');

    expect(
      buildQrGeneratorRedirectHref('?content=hello&tag=one&tag=two&empty=')
    ).toBe('https://qr.example.com/?content=hello&tag=one&tag=two&empty=');
  });

  it('accepts URLSearchParams input for server-side call sites', () => {
    vi.stubEnv('QR_APP_URL', 'https://qr.example.com');

    const searchParams = new URLSearchParams();
    searchParams.append('url', 'https://tuturuuu.com/docs');

    expect(buildQrGeneratorRedirectHref(searchParams)).toBe(
      'https://qr.example.com/?url=https%3A%2F%2Ftuturuuu.com%2Fdocs'
    );
  });

  it('preserves legacy mail app redirect targets', () => {
    vi.stubEnv('MAIL_APP_URL', 'https://mail.example.com/base/');

    expect(buildMailRedirectHref('ws-1')).toBe('https://mail.example.com/ws-1');
    expect(buildMailRedirectHref('ws-1', { folder: 'sent' })).toBe(
      'https://mail.example.com/ws-1?folder=sent'
    );
  });

  it('preserves legacy CMS app redirect targets', () => {
    vi.stubEnv('CMS_APP_URL', 'https://cms.example.com/base/');

    expect(buildCmsRedirectHref('/ws-1')).toBe('https://cms.example.com/ws-1');
    expect(buildCmsRedirectHref('/ws-1/content')).toBe(
      'https://cms.example.com/ws-1/content'
    );
    expect(buildCmsCollectionRedirectHref('ws-1', 'collection-1')).toBe(
      'https://cms.example.com/ws-1/content/collections/collection-1'
    );
    expect(buildCmsEntryRedirectHref('ws-1', 'entry-1')).toBe(
      'https://cms.example.com/ws-1/content/entries/entry-1'
    );
  });

  it('normalizes verify-token redirects with the legacy safe fallback', () => {
    expect(buildVerifyTokenRedirectHref('?nextUrl=%2Fpersonal%2Ftasks')).toBe(
      '/personal/tasks'
    );
    expect(
      buildVerifyTokenRedirectHref('?nextUrl=https%3A%2F%2Fevil.test')
    ).toBe('/onboarding');
    expect(buildVerifyTokenRedirectHref('?nextUrl=%2F%2Fevil.test')).toBe(
      '/onboarding'
    );
  });
});
