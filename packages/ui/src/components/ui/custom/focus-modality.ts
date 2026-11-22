/**
 * Keyboard-only focus rings.
 *
 * Browsers treat a click into a text field as `:focus-visible`, so a ring drawn
 * on `:focus-visible` still appears for mouse and touch users. The pre-paint
 * script records the last input modality on `<html>` instead:
 * `data-focus-modality="pointer"` after a mouse, pen or touch press, and
 * `"keyboard"` after Tab or arrow-key navigation. `globals.css` gates the
 * `focus-visible:` variant (and the Sorbet focus rules) on it, so only keyboard
 * navigation draws a ring. Before any input the attribute is absent and the
 * browser's own `:focus-visible` heuristics apply.
 */

export const FOCUS_MODALITY_ATTRIBUTE = 'data-focus-modality';
export type FocusModality = 'keyboard' | 'pointer';

/** Keys that leave a text field; any other key there is typing. */
export const TEXT_FIELD_EXIT_KEYS = ['Tab', 'F6', 'Escape'] as const;

/** Keys that never count as keyboard navigation on their own. */
const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'] as const;

/** Input types whose keys type text or move the caret. */
const TEXT_INPUT_TYPES = [
  '',
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
] as const;

/**
 * A self-contained snippet for the pre-paint script. It only listens for input
 * events and sets one allowlisted attribute on `<html>`, mirroring the
 * browser's own heuristic: any key outside a text field (Enter or Space on a
 * clicked button, arrows in a menu) means keyboard; inside a text field only
 * Tab, F6 and Escape do, so typing never brings a ring back. Shortcuts with
 * Cmd, Ctrl or Alt, and keys an input method is composing (Escape cancelling
 * a Telex candidate), don't count. Listeners use the capture phase, so the
 * modality is known before the press or key moves focus.
 */
export const FOCUS_MODALITY_SCRIPT = `var fd=document,fr=fd.documentElement,fa=${JSON.stringify(
  FOCUS_MODALITY_ATTRIBUTE
)},fx=${JSON.stringify(TEXT_FIELD_EXIT_KEYS)},fm=${JSON.stringify(
  MODIFIER_KEYS
)},ft=${JSON.stringify(
  TEXT_INPUT_TYPES
)};fd.addEventListener("pointerdown",function(){fr.setAttribute(fa,"pointer")},true);fd.addEventListener("keydown",function(e){if(e.isComposing||e.keyCode===229||e.metaKey||e.ctrlKey||e.altKey||fm.indexOf(e.key)>=0)return;var t=e.target;if(fx.indexOf(e.key)<0&&t&&(t.isContentEditable||t.tagName==="TEXTAREA"||(t.tagName==="INPUT"&&ft.indexOf(String(t.getAttribute("type")||"").toLowerCase())>=0)))return;fr.setAttribute(fa,"keyboard")},true);`;

export function readFocusModality(
  root: HTMLElement = document.documentElement
): FocusModality | null {
  const value = root.getAttribute(FOCUS_MODALITY_ATTRIBUTE);
  return value === 'keyboard' || value === 'pointer' ? value : null;
}
