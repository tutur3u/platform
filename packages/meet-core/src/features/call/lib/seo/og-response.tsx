import { ImageResponse } from 'next/og';
import { MeetOgCard, OG_SIZE } from './og-card';
import type { MeetOgContent } from './og-content';

/**
 * Detail cards come from a host-controlled setting, so they stay short-lived;
 * generic and landing cards never change for a given URL (the `v` key moves
 * with the content) and cache for a day.
 */
export function meetOgCacheControl(content: MeetOgContent) {
  return content.variant === 'detailed'
    ? 'public, max-age=300, s-maxage=300'
    : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';
}

export function renderMeetOgImage(content: MeetOgContent) {
  const headers: Record<string, string> = {
    'Cache-Control': meetOgCacheControl(content),
  };
  // Room cards stay out of image search; the landing card may be indexed.
  if (content.variant !== 'landing') headers['X-Robots-Tag'] = 'noindex';
  return new ImageResponse(<MeetOgCard content={content} />, {
    ...OG_SIZE,
    headers,
  });
}
