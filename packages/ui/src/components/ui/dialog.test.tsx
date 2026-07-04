import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from './dialog';

function renderOpenDialog(children: ReactNode) {
  return render(<Dialog open>{children}</Dialog>);
}

describe('DialogContent presentation', () => {
  it('keeps the default centered dialog animation classes', () => {
    renderOpenDialog(
      <DialogContent>
        <DialogTitle>Default dialog</DialogTitle>
      </DialogContent>
    );

    const dialog = screen.getByRole('dialog', { name: 'Default dialog' });
    const className = dialog.getAttribute('class') ?? '';

    expect(className).toContain('top-[50%]');
    expect(className).toContain('left-[50%]');
    expect(className).toContain('data-[state=open]:animate-in');
    expect(className).toContain('data-[state=open]:fade-in-0');
    expect(className).toContain('data-[state=open]:zoom-in-95');
    expect(dialog).toHaveClass('rounded-lg');
  });

  it('renders fullscreen content as an opaque non-animated viewport surface', () => {
    renderOpenDialog(
      <DialogContent presentation="fullscreen">
        <DialogTitle>Fullscreen dialog</DialogTitle>
      </DialogContent>
    );

    const dialog = screen.getByRole('dialog', { name: 'Fullscreen dialog' });
    const className = dialog.getAttribute('class') ?? '';

    expect(dialog).toHaveClass('fixed');
    expect(dialog).toHaveClass('inset-0');
    expect(dialog).toHaveClass('h-dvh');
    expect(dialog).toHaveClass('max-h-dvh');
    expect(dialog).toHaveClass('w-screen');
    expect(dialog).toHaveClass('max-w-none');
    expect(dialog).toHaveClass('bg-background');
    expect(dialog).toHaveClass('rounded-none');
    expect(dialog).toHaveClass('border-0');
    expect(dialog).toHaveClass('shadow-none');
    expect(className).not.toMatch(/animate-in|fade-in|zoom-in|slide-in/);
  });
});
