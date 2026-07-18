export function claimSettingsDialogIntent(event: Event) {
  if (event.defaultPrevented) return false;

  event.preventDefault();
  return true;
}
