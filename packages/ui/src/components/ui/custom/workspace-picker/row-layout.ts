export type PickerVariant = 'dialog' | 'sheet';

/**
 * Fixed row columns: name, plan badge, current check, actions. Actions own a
 * column of their own, so they can never cover or push the plan badge, and
 * every row keeps the same badge position whichever actions it offers.
 */
export const PICKER_ROW_LAYOUT = {
  dialog: {
    badge: 88,
    state: 24,
    actions: 96,
    actionSize: 28,
    actionGap: 2,
    actionInset: 6,
    actionSlots: 3,
  },
  sheet: {
    badge: 'auto',
    state: 20,
    actions: 44,
    actionSize: 44,
    actionGap: 0,
    actionInset: 0,
    actionSlots: 1,
  },
} as const satisfies Record<
  PickerVariant,
  {
    badge: number | 'auto';
    state: number;
    actions: number;
    actionSize: number;
    actionGap: number;
    actionInset: number;
    actionSlots: number;
  }
>;

export function pickerRowColumns(variant: PickerVariant) {
  const layout = PICKER_ROW_LAYOUT[variant];
  const badge = layout.badge === 'auto' ? 'auto' : `${layout.badge}px`;
  return `minmax(0,1fr) ${badge} ${layout.state}px ${layout.actions}px`;
}
