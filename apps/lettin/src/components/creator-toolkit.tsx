'use client';

import {
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  Coins,
  FolderOpen,
  MessageCircle,
  Network,
  Sparkles,
  Video,
} from '@tuturuuu/icons';
import {
  type AppName,
  getPortlessInternalAppUrl,
  PRODUCTION_INTERNAL_APP_DOMAINS,
} from '@tuturuuu/utils/internal-domains';
import { useLocale, useTranslations } from 'next-intl';
import { WEB_APP_URL } from '@/constants/common';

const tools = [
  { key: 'tasks', app: 'tasks', path: '/tasks', icon: CheckCheck },
  { key: 'drive', app: 'drive', path: '', icon: FolderOpen },
  { key: 'calendar', app: 'calendar', path: '', icon: CalendarDays },
  { key: 'chat', app: 'chat', path: '', icon: MessageCircle },
  { key: 'mind', app: 'mind', path: '', icon: Network },
  { key: 'finance', app: 'finance', path: '', icon: Coins },
] as const;

function appOrigin(app: AppName) {
  return process.env.NODE_ENV === 'development'
    ? (getPortlessInternalAppUrl(app) ??
        PRODUCTION_INTERNAL_APP_DOMAINS.find((domain) => domain.name === app)!
          .url)
    : PRODUCTION_INTERNAL_APP_DOMAINS.find((domain) => domain.name === app)!
        .url;
}

export function CreatorToolkit({
  wsId,
  showHeading = true,
}: {
  wsId?: string;
  showHeading?: boolean;
}) {
  const t = useTranslations('lettin');
  const locale = useLocale();
  const workspacePath = wsId
    ? `/${locale}/${encodeURIComponent(wsId)}`
    : `/${locale}`;
  return (
    <section className="creator-toolkit" aria-label={t('creativeToolkit')}>
      {showHeading && (
        <div className="toolkit-heading">
          <div>
            <p className="lettin-kicker">{t('poweredByTuturuuu')}</p>
            <h2 id="toolkit-title">{t('toolkitTitle')}</h2>
          </div>
          <p>{t(wsId ? 'toolkitWorkspaceHint' : 'toolkitHint')}</p>
        </div>
      )}
      <div className="toolkit-grid">
        {tools.map(({ key, app, path, icon: Icon }) => (
          <a
            key={key}
            href={`${appOrigin(app)}${workspacePath}${wsId ? path : ''}`}
            className="toolkit-link"
          >
            <Icon className="toolkit-icon" size={22} />
            <div>
              <h3>{t(`tool${key}`)}</h3>
              <p>{t(`tool${key}Hint`)}</p>
            </div>
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        ))}
      </div>
      <details className="toolkit-more">
        <summary>
          {t('moreTools')}
          <ChevronDown size={16} />
        </summary>
        <div className="toolkit-grid">
          <a
            className="toolkit-link"
            href={`${WEB_APP_URL}${wsId ? `${workspacePath}/ai-chat` : `/${locale}/dashboard`}`}
          >
            <Sparkles size={22} />
            <div>
              <h3>{t('toolAi')}</h3>
              <p>{t('toolAiHint')}</p>
            </div>
            <ArrowUpRight size={16} />
          </a>
          <a className="toolkit-link" href={appOrigin('meet')}>
            <Video size={22} />
            <div>
              <h3>{t('toolMeet')}</h3>
              <p>{t('toolMeetHint')}</p>
            </div>
            <ArrowUpRight size={16} />
          </a>
          <a className="toolkit-link" href={`${appOrigin('apps')}/${locale}`}>
            <Network size={22} />
            <div>
              <h3>{t('allServices')}</h3>
              <p>{t('allServicesHint')}</p>
            </div>
            <ArrowUpRight size={16} />
          </a>
        </div>
      </details>
      <p className="toolkit-footnote">{t('toolkitAccessNote')}</p>
    </section>
  );
}
