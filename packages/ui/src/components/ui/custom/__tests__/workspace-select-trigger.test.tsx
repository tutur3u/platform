import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../dialog';
import {
  WorkspaceSelectTrigger,
  type WorkspaceSelectTriggerProps,
} from '../workspace-select-trigger';

const labels = {
  select: 'Select workspace',
  switch: 'Switch workspace',
  loading: 'Loading',
  invitations: 'invitations',
};

function renderTrigger(props: Partial<WorkspaceSelectTriggerProps> = {}) {
  return render(
    <Dialog>
      <DialogTrigger asChild>
        <WorkspaceSelectTrigger
          appearance="switch"
          labels={labels}
          workspace={{ name: 'Easy Center', tier: 'FREE' }}
          {...props}
        />
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Select workspace</DialogTitle>
        <DialogDescription>Choose a workspace</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

describe('WorkspaceSelectTrigger', () => {
  it('shows the avatar and "Switch workspace" in the sidebar, not a dropdown', () => {
    renderTrigger();

    const trigger = screen.getByRole('button', { name: 'Switch workspace' });
    expect(trigger.textContent).toBe('Switch workspace');
    expect(trigger.querySelector('[data-slot="avatar"]')).not.toBeNull();
    expect(trigger.getAttribute('data-workspace-trigger')).toBe('switch');
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);
    // No current-workspace name, plan badge or chevron: nothing reads as a
    // dropdown, and no combobox role or list is exposed.
    expect(screen.queryByText('Easy Center')).toBeNull();
    expect(screen.queryByText('FREE')).toBeNull();
    expect(trigger.querySelector('svg')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger.getAttribute('aria-keyshortcuts')).toBe(
      'Meta+Shift+K Control+Shift+K'
    );
  });

  it('opens the Select workspace dialog on click', () => {
    renderTrigger();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Switch workspace' }));

    expect(
      screen.getByRole('dialog', { name: 'Select workspace' })
    ).toBeTruthy();
  });

  it('is avatar-only in the collapsed rail, with a name, tooltip and dialog', async () => {
    renderTrigger({ compact: true });

    const trigger = screen.getByRole('button', { name: 'Switch workspace' });
    expect(trigger.textContent).toBe('');
    expect(trigger.querySelector('[data-slot="avatar"]')).not.toBeNull();

    fireEvent.focus(trigger);
    expect((await screen.findByRole('tooltip')).textContent).toContain(
      'Switch workspace'
    );

    fireEvent.click(trigger);
    expect(
      screen.getByRole('dialog', { name: 'Select workspace' })
    ).toBeTruthy();
  });

  it('announces the invitation count as the button description', () => {
    renderTrigger({ invitationCount: 3 });

    const trigger = screen.getByRole('button', { name: 'Switch workspace' });
    const descriptionId = trigger.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(descriptionId)?.textContent).toBe(
      '3 invitations'
    );
    expect(trigger.textContent).toContain('3');
  });

  it('keeps a caller description alongside the invitation count', () => {
    renderTrigger({ invitationCount: 2, 'aria-describedby': 'caller-hint' });

    const ids = (
      screen
        .getByRole('button', { name: 'Switch workspace' })
        .getAttribute('aria-describedby') ?? ''
    ).split(' ');
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe('caller-hint');
    expect(document.getElementById(ids[1] ?? '')?.textContent).toBe(
      '2 invitations'
    );
  });

  it('marks invitations with a dot in the narrow collapsed rail', () => {
    renderTrigger({ compact: true, invitationCount: 120 });

    const trigger = screen.getByRole('button', { name: 'Switch workspace' });
    expect(trigger.querySelector('[data-invitation-dot]')).not.toBeNull();
    expect(trigger.textContent).toBe('120 invitations');
    expect(trigger.querySelector('[data-slot="badge"]')).toBeNull();
  });

  it('draws its keyboard ring inside the clipped sidebar section', () => {
    renderTrigger();

    const trigger = screen.getByRole('button', { name: 'Switch workspace' });
    expect(trigger.className).toContain('focus-visible:ring-inset');
    expect(trigger.getAttribute('type')).toBe('button');
  });

  it('still names the current workspace outside the sidebar', () => {
    renderTrigger({ appearance: 'workspace' });

    const trigger = screen.getByRole('button', { name: 'Select workspace' });
    expect(trigger.textContent).toContain('Easy Center');
    expect(trigger.textContent).toContain('FREE');
    expect(trigger.querySelector('svg')).not.toBeNull();
  });
});
