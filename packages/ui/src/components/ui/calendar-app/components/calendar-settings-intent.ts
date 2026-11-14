import { SETTINGS_DIALOG_OPEN_INTENT_EVENT } from '../../../../hooks/settings-dialog-url';

/** The app settings tab that lists calendar accounts and their calendars. */
export const CALENDAR_SETTINGS_TAB = 'calendar_integrations';

/**
 * Asks the app's settings dialog host to open at the calendar accounts tab.
 * The event is cancelable so exactly one host claims it.
 */
export function openCalendarSettings() {
  window.dispatchEvent(
    new CustomEvent(SETTINGS_DIALOG_OPEN_INTENT_EVENT, {
      cancelable: true,
      detail: { settingsTab: CALENDAR_SETTINGS_TAB },
    })
  );
}
