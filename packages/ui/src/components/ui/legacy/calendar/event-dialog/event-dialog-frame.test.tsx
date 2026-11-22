// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from '@tuturuuu/ui/dialog';
import { Tabs } from '@tuturuuu/ui/tabs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventDialogContent, EventDialogHeader } from './event-dialog-frame';

const mobile = vi.hoisted(() => ({ value: false }));
vi.mock('@tuturuuu/ui/hooks/use-mobile', () => ({
  useIsMobile: () => mobile.value,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderDialog(onSubmitShortcut = vi.fn(), showModeTabs = true) {
  render(
    <Dialog open>
      <EventDialogContent onSubmitShortcut={onSubmitShortcut}>
        <Tabs value="manual">
          <EventDialogHeader
            event={{}}
            isEditing={false}
            showModeTabs={showModeTabs}
          />
        </Tabs>
        <textarea aria-label="Description" />
      </EventDialogContent>
    </Dialog>
  );
  return onSubmitShortcut;
}

beforeEach(() => {
  mobile.value = false;
});

describe('EventDialogContent', () => {
  it('saves on Cmd or Ctrl+Enter from any field, not on a plain Enter', () => {
    const submit = renderDialog();
    const description = screen.getByRole('textbox', { name: 'Description' });

    fireEvent.keyDown(description, { key: 'Enter' });
    expect(submit).not.toHaveBeenCalled();

    fireEvent.keyDown(description, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(description, { key: 'Enter', ctrlKey: true });
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('opens as a centred dialog on larger screens and full screen on phones', () => {
    renderDialog();
    expect(screen.getByRole('dialog').getAttribute('data-presentation')).toBe(
      'default'
    );
  });

  it('opens full screen on phones, keeping the safe-area padding', () => {
    mobile.value = true;
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('data-presentation')).toBe('fullscreen');
    expect(dialog.className).toContain('pb-[env(safe-area-inset-bottom,0px)]');
    expect(dialog.className).not.toMatch(/(^|\s)p-0(\s|$)/);
  });

  it('lets Escape cancel an input method candidate without closing', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <EventDialogContent onSubmitShortcut={vi.fn()}>
          <textarea aria-label="Notes" />
        </EventDialogContent>
      </Dialog>
    );
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    fireEvent.keyDown(notes, { key: 'Escape', isComposing: true });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.keyDown(notes, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('EventDialogHeader', () => {
  it('titles the dialog and offers the entry modes as tabs', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'new_title' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'mode_label' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'tab_quick' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'tab_ai' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'close' })).toBeTruthy();
  });

  it('hides the entry modes when there is only one', () => {
    renderDialog(vi.fn(), false);
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
