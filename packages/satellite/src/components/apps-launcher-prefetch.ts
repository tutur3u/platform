import { useEffect } from 'react';

const APEX_ORIGIN = 'https://tuturuuu.com';
export const PUBLIC_TOOLS_LAUNCHER_URL = `${APEX_ORIGIN}/tools?source=sidebar-apps`;

const publicToolsLink = `a[data-app-slug="tools"][role="option"][href="${PUBLIC_TOOLS_LAUNCHER_URL}"]:not([target])`;

export function useAppsLauncherPrefetch(enabled: boolean) {
  useEffect(() => {
    if (!enabled || window.location.origin !== APEX_ORIGIN) return;

    const script = document.createElement('script');
    script.type = 'speculationrules';
    script.dataset.slot = 'apps-launcher-prefetch';
    try {
      script.textContent = JSON.stringify({
        prefetch: [
          {
            source: 'document',
            where: { selector_matches: publicToolsLink },
            eagerness: 'moderate',
          },
        ],
      });
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      // Documents that restrict this script sink keep ordinary navigation.
      return;
    }
    document.head.appendChild(script);
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [enabled]);
}
