type CaretUser = { id?: unknown; name?: unknown; color?: unknown };
function identity(user: CaretUser) {
  return typeof user.id === 'string' ? user.id.slice(0, 100) : '';
}
function color(user: CaretUser) {
  return typeof user.color === 'string' && /^#[0-9a-f]{6}$/i.test(user.color)
    ? user.color
    : 'var(--primary)';
}
/** Self-contained caret styling works in every editor surface, including Meet. */
export function renderCollaborationCaret(user: CaretUser) {
  const caret = document.createElement('span');
  caret.className = 'collaboration-carets__caret';
  caret.dataset.userId = identity(user);
  Object.assign(caret.style, {
    borderLeft: `2px solid ${color(user)}`,
    position: 'relative',
    marginLeft: '-1px',
    pointerEvents: 'none',
  });
  const label = document.createElement('span');
  label.className = 'collaboration-carets__label';
  label.dataset.userId = identity(user);
  label.textContent =
    typeof user.name === 'string' ? user.name.slice(0, 100) : '';
  Object.assign(label.style, {
    position: 'absolute',
    top: '-1.4em',
    left: '-2px',
    padding: '1px 4px',
    borderRadius: '3px 3px 3px 0',
    backgroundColor: color(user),
    color: 'var(--primary-foreground)',
    fontSize: '11px',
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  });
  caret.append(label);
  return caret;
}
export function renderCollaborationSelection(user: CaretUser) {
  return {
    nodeName: 'span',
    class: 'collaboration-carets__selection',
    'data-user-id': identity(user),
    style: `background-color: color-mix(in srgb, ${color(user)} 24%, transparent);`,
  };
}
export function scrollToCollaborationCaret(root: HTMLElement, userId: string) {
  const caret = [
    ...root.querySelectorAll<HTMLElement>('.collaboration-carets__caret'),
  ].find((element) => element.dataset.userId === userId);
  caret?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !!caret;
}
