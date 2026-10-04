'use client';
import {
  BookOpen,
  Clock,
  Globe,
  MapPin,
  Network,
  ScrollText,
  Shield,
  Users,
} from '@tuturuuu/icons';
import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { sectionKind, type WikiSection, wikiSections } from './wiki-model';

const icons = {
  overview: BookOpen,
  characters: Users,
  locations: MapPin,
  stories: ScrollText,
  worlds: Globe,
  timeline: Clock,
  relationships: Network,
  roles: Shield,
  organizations: Users,
  lore: ScrollText,
  pages: BookOpen,
};
export function WikiSidebar({
  wsId,
  worldId,
  entries,
  section,
  disabled,
  onOverview,
}: {
  wsId: string;
  worldId: string;
  entries: LettinRecord[];
  section: WikiSection;
  disabled: boolean;
  onOverview: () => void;
}) {
  const t = useTranslations('lettin');
  return (
    <nav className="wiki-section-nav" aria-label={t('wikiNavigation')}>
      <Button variant="ghost" disabled={disabled} onClick={onOverview}>
        {t('worldDetails')}
      </Button>
      {wikiSections.map((value) => {
        const Icon = icons[value];
        const count = sectionKind[value]
          ? entries.filter((entry) => entry.draft.kind === sectionKind[value])
              .length
          : entries.length;
        return (
          <Link
            key={value}
            href={`/${wsId}/wiki/${worldId}/${value}`}
            aria-current={value === section ? 'page' : undefined}
            aria-disabled={disabled}
            onClick={(e) => {
              if (disabled) e.preventDefault();
            }}
          >
            <Icon size={16} />
            <span>{t(`section${value}`)}</span>
            {!['relationships', 'timeline'].includes(value) && (
              <small className="wiki-nav-count">{count}</small>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
