import { describe, expect, it } from 'vitest';
import { isTaskCardContextMenuSelectionGuarded } from './task-card-menu-guard';

describe('isTaskCardContextMenuSelectionGuarded', () => {
  it('blocks the release event that follows a card right-click', () => {
    expect(isTaskCardContextMenuSelectionGuarded(1_400, 1_100)).toBe(true);
  });

  it('allows an intentional menu selection after the guard expires', () => {
    expect(isTaskCardContextMenuSelectionGuarded(1_400, 1_400)).toBe(false);
  });

  it('does not guard keyboard-opened menus', () => {
    expect(isTaskCardContextMenuSelectionGuarded(0, 1_100)).toBe(false);
  });
});
