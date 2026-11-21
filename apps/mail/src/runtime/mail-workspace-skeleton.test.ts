// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  MailContentSkeleton,
  MailWorkspaceSkeleton,
} from './mail-workspace-skeleton';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `t:${key}`,
}));
afterEach(cleanup);

it('announces one busy status and hides the decorative shapes', () => {
  const { container } = render(h(MailWorkspaceSkeleton));
  const status = screen.getByRole('status', { name: 't:loading' });
  expect(status.getAttribute('aria-busy')).toBe('true');
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(
    container.querySelector('[aria-hidden="true"] [data-slot="skeleton"]')
  ).not.toBeNull();
  expect(screen.queryByText(/\S/u)).toBeNull();
});

it('matches the shell regions: sidebar, thread list and reader', () => {
  const { container } = render(h(MailWorkspaceSkeleton));
  for (const slot of [
    'mail-skeleton-sidebar',
    'mail-skeleton-list',
    'mail-skeleton-reader',
  ])
    expect(container.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
  expect(
    container.querySelectorAll('[data-slot="mail-skeleton-list"] > div')
  ).toHaveLength(3);
});

it('stops pulsing for reduced motion on every shape', () => {
  const { container } = render(h(MailWorkspaceSkeleton));
  const shapes = [...container.querySelectorAll('[data-slot="skeleton"]')];
  expect(shapes.length).toBeGreaterThan(10);
  for (const shape of shapes)
    expect(shape.className).toContain('motion-reduce:animate-none');
});

it('content skeleton keeps the workspace box and default 38/62 split', () => {
  const { container } = render(h(MailContentSkeleton));
  const status = screen.getByRole('status', { name: 't:loading' });
  expect(status.className).toContain('md:h-dvh');
  expect(status.className).toContain('-m-2');
  expect(
    container.querySelector('[data-slot="mail-skeleton-sidebar"]')
  ).toBeNull();
  expect(
    container.querySelector('[data-slot="mail-skeleton-list"]')?.className
  ).toContain('lg:basis-[38%]');
  expect(
    container.querySelector('[data-slot="mail-skeleton-reader"]')
  ).not.toBeNull();
});
