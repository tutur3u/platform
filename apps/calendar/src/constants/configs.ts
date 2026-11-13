import { runtimeAppBase } from '@tuturuuu/start-bridge/app-url';
import { CALENDAR_ROOT_ORIGIN, WEB_ORIGIN } from './calendar-origins';
import { BASE_URL, DEV_MODE, TTR_URL } from './common';
import { resolveCalendarSiteUrls } from './site-urls';

const SITE_NAME = 'Tuturuuu Calendar';
const SITE_LINKS = {
  twitter: 'https://twitter.com/tutur3u',
  github: 'https://github.com/tutur3u/platform',
};

/**
 * Public site URLs for an app base. The base defaults to the current
 * request's (the document's in the browser): empty at the Calendar host root,
 * `/calendar` when served from the web origin.
 */
export function getSiteConfig(basePath: string = runtimeAppBase()) {
  const urls = resolveCalendarSiteUrls({
    basePath,
    rootOrigin: DEV_MODE ? BASE_URL : CALENDAR_ROOT_ORIGIN,
    webOrigin: DEV_MODE ? TTR_URL : WEB_ORIGIN,
  });
  return { name: SITE_NAME, ...urls, links: SITE_LINKS };
}

/** Site configuration at the Calendar host root. */
export const siteConfig = getSiteConfig('');

export interface AppConfig {
  readonly openai: {
    apiKey: string;
    baseURL?: string;
  };
  readonly google: {
    apiKey: string;
    baseURL?: string;
  };
  anthropic: {
    apiKey: string;
    baseURL?: string;
  };
  readonly vertex: {
    project?: string;
    location?: string;
    email?: string;
    clientId?: string;
    privateKey?: string;
    privateKeyId?: string;
    credentials?: string;
  };
  readonly defaultModel: string;
}

export const appConfig: AppConfig = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  google: {
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },
  vertex: {
    project: process.env.GOOGLE_VERTEX_PROJECT,
    location: process.env.GOOGLE_VERTEX_LOCATION,
    email: process.env.GOOGLE_VERTEX_EMAIL,
    clientId: process.env.GOOGLE_VERTEX_CLIENT_ID,
    privateKey: process.env.GOOGLE_VERTEX_PRIVATE_KEY,
    privateKeyId: process.env.GOOGLE_VERTEX_PRIVATE_KEY_ID,
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  },
  defaultModel: process.env.DEFAULT_AI_MODEL || 'gemini-2.5-flash',
};
