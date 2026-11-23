import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  FadeIn,
  LoadingRegion,
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonLine,
  SkeletonList,
  SkeletonSelectorTrigger,
  SkeletonSidebarItem,
  SkeletonTableRows,
  SkeletonText,
  skeletonClassName,
} from '../skeleton';

describe('skeleton kit', () => {
  it('keeps the base skeleton API and merges caller classes', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const node = container.firstElementChild as HTMLElement;
    expect(node.dataset.slot).toBe('skeleton');
    expect(node.className).toContain('h-4');
    expect(node.className).toContain('w-20');
    expect(node.className).toContain('rounded-md');
  });

  it('uses token colours, a shimmer sweep and a reduced-motion opt-out', () => {
    expect(skeletonClassName).toContain('bg-primary/10');
    expect(skeletonClassName).toContain('before:animate-[shimmer');
    expect(skeletonClassName).toContain('motion-reduce:before:hidden');
    // Design tokens only: no hard-coded hue utilities.
    expect(skeletonClassName).not.toMatch(
      /\b(bg|from|via|to)-(red|blue|green|gray|slate|zinc|neutral)-\d/
    );
  });

  it('sizes a text line to the real line box so content swaps without shift', () => {
    const { container } = render(
      <SkeletonLine size="base" barClassName="w-24" />
    );
    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain('h-6');
    expect(box.getAttribute('aria-hidden')).toBe('true');
    expect((box.firstElementChild as HTMLElement).className).toContain('w-24');
  });

  it('renders the requested number of paragraph lines', () => {
    const { container } = render(<SkeletonText lines={4} />);
    expect(
      container.querySelectorAll('[data-slot="skeleton-line"]')
    ).toHaveLength(4);
  });

  it('announces loading only to assistive tech', () => {
    render(
      <LoadingRegion srLabel="Đang tải" className="space-y-2">
        <SkeletonLine />
      </LoadingRegion>
    );
    const region = screen.getByRole('status');
    // A busy live region would suppress its own announcement.
    expect(region.hasAttribute('aria-busy')).toBe(false);
    const label = screen.getByText('Đang tải');
    expect(label.className).toBe('sr-only');
    expect(region.firstElementChild).toBe(label);
  });

  it('renders layout-matched placeholders as decorative', () => {
    const { container } = render(
      <div>
        <SkeletonAvatar size="lg" />
        <SkeletonCard lines={2} />
        <SkeletonList rows={3} withTrailing />
        <SkeletonSidebarItem />
        <SkeletonSelectorTrigger withIcon />
      </div>
    );
    const avatar = container.querySelector(
      '[data-slot="skeleton-avatar"]'
    ) as HTMLElement;
    expect(avatar.className).toContain('size-10');
    expect(avatar.className).toContain('rounded-full');
    expect(
      container.querySelectorAll('[data-slot="skeleton-list-row"]')
    ).toHaveLength(3);
    const trigger = container.querySelector(
      '[data-slot="skeleton-selector-trigger"]'
    ) as HTMLElement;
    expect(trigger.className).toContain('h-9');
    expect(trigger.className).toContain('border-input');
    const sidebarItem = container.querySelector(
      '[data-slot="skeleton-sidebar-item"]'
    ) as HTMLElement;
    expect(sidebarItem.className).toContain('h-8');
    for (const slot of [
      'skeleton-card',
      'skeleton-list',
      'skeleton-sidebar-item',
      'skeleton-selector-trigger',
    ]) {
      expect(
        container
          .querySelector(`[data-slot="${slot}"]`)
          ?.getAttribute('aria-hidden')
      ).toBe('true');
    }
    expect(container.textContent).toBe('');
  });

  it('renders table rows with the requested column count', () => {
    const { container } = render(
      <table>
        <tbody>
          <SkeletonTableRows rows={2} columns={4} />
        </tbody>
      </table>
    );
    const rows = container.querySelectorAll('tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelectorAll('td')).toHaveLength(4);
  });

  it('fades content in without delaying it', () => {
    render(<FadeIn>ready</FadeIn>);
    const node = screen.getByText('ready');
    expect(node.className).toContain('animate-in');
    expect(node.className).toContain('motion-reduce:animate-none');
    expect(node.className).not.toMatch(/delay-/);
  });
});
