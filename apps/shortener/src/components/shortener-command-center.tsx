import {
  buildCommandLauncherLabelsFromMessages,
  CommandCenterHost,
} from '@tuturuuu/satellite/command-center';

// Labels follow the document language of the page being shown and load from
// the app's message bundle with the dialog, on first open.
function loadLabels() {
  const vi = document.documentElement.lang.toLowerCase().startsWith('vi');
  return (
    vi ? import('../../messages/vi.json') : import('../../messages/en.json')
  ).then((module) =>
    buildCommandLauncherLabelsFromMessages(module.default.command_launcher)
  );
}

/**
 * Shortener's shared command center. Link status pages are public: with no
 * signed-in actor the center lists apps only and sends no API requests.
 */
export function ShortenerCommandCenter() {
  return <CommandCenterHost currentApp="shortener" labelsLoader={loadLabels} />;
}
