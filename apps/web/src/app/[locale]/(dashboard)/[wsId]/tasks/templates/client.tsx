'use client';

import {
  Bookmark,
  Globe,
  KanbanSquare,
  ListTodo,
  Lock,
  Plus,
  Search,
  Tags,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import type { BoardTemplate, TemplateFilter } from './types';

interface Props {
  wsId: string;
  initialTemplates: BoardTemplate[];
  initialVisibility: TemplateFilter;
}

export default function TemplatesClient({
  wsId,
  initialTemplates,
  initialVisibility,
}: Props) {
  const t = useTranslations('ws-board-templates');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState('');

  // Handle visibility change with server-side fetch
  const handleVisibilityChange = (newVisibility: TemplateFilter) => {
    const params = new URLSearchParams(searchParams.toString());

    if (newVisibility === 'workspace') {
      params.delete('visibility');
    } else {
      params.set('visibility', newVisibility);
    }

    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  };

  // Client-side text search filtering only
  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return initialTemplates;

    const query = searchQuery.toLowerCase();
    return initialTemplates.filter(
      (tmpl) =>
        tmpl.name.toLowerCase().includes(query) ||
        tmpl.description?.toLowerCase().includes(query)
    );
  }, [initialTemplates, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <p className="font-medium text-sm leading-none">Search</p>
              <div className="relative w-64">
                <Input
                  placeholder={t('gallery.search_placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-sm leading-none">Visibility</p>
              <Select
                value={initialVisibility}
                onValueChange={(v) =>
                  handleVisibilityChange(v as TemplateFilter)
                }
                disabled={isPending}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span>{t('visibility.public')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="workspace">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>{t('visibility.workspace')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="private">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      <span>{t('visibility.private')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Bookmark className="h-4 w-4" />
            <span>
              {t('gallery.count_templates', {
                count: initialTemplates.length,
              })}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <EmptyState
          searchQuery={searchQuery}
          visibility={initialVisibility}
          onClearSearch={() => setSearchQuery('')}
          onClearFilter={() => handleVisibilityChange('public')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTemplates.map((template) => (
            <TemplateCard key={template.id} template={template} wsId={wsId} />
          ))}
        </div>
      )}
    </div>
  );
}

interface TemplateCardProps {
  template: BoardTemplate;
  wsId: string;
}

function TemplateCard({ template, wsId }: TemplateCardProps) {
  const t = useTranslations('ws-board-templates');

  const visibilityIcon =
    template.visibility === 'private' ? (
      <Lock className="h-3.5 w-3.5" />
    ) : template.visibility === 'workspace' ? (
      <Users className="h-3.5 w-3.5" />
    ) : (
      <Globe className="h-3.5 w-3.5" />
    );

  const visibilityLabel = t(`visibility.${template.visibility}`);

  return (
    <Link href={`/${wsId}/tasks/templates/${template.id}`}>
      <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-primary/10 p-2">
                <Bookmark className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-base">
                  {template.name}
                </CardTitle>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'flex shrink-0 items-center gap-1 text-xs',
                template.visibility === 'private' &&
                  'border-dynamic-orange/30 text-dynamic-orange',
                template.visibility === 'workspace' &&
                  'border-dynamic-blue/30 text-dynamic-blue',
                template.visibility === 'public' &&
                  'border-dynamic-green/30 text-dynamic-green'
              )}
            >
              {visibilityIcon}
              <span className="hidden sm:inline">{visibilityLabel}</span>
            </Badge>
          </div>
          {template.description && (
            <CardDescription className="line-clamp-2 text-sm">
              {template.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
            <div className="flex items-center gap-1">
              <KanbanSquare className="h-3.5 w-3.5" />
              <span>
                {template.stats.lists} {t('gallery.lists')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <ListTodo className="h-3.5 w-3.5" />
              <span>
                {template.stats.tasks} {t('gallery.tasks')}
              </span>
            </div>
            {template.stats.labels > 0 && (
              <div className="flex items-center gap-1">
                <Tags className="h-3.5 w-3.5" />
                <span>
                  {template.stats.labels} {t('gallery.labels')}
                </span>
              </div>
            )}
          </div>
          {template.isOwner && (
            <Badge
              variant="secondary"
              className="mt-3 bg-primary/10 text-primary text-xs"
            >
              {t('gallery.owner_badge')}
            </Badge>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

interface EmptyStateProps {
  searchQuery: string;
  visibility: TemplateFilter;
  onClearSearch: () => void;
  onClearFilter: () => void;
}

function EmptyState({
  searchQuery,
  visibility,
  onClearSearch,
  onClearFilter,
}: EmptyStateProps) {
  const t = useTranslations('ws-board-templates');

  if (searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Search className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="mb-2 font-semibold text-lg">
          {t('gallery.no_search_results')}
        </h3>
        <p className="mb-4 text-muted-foreground text-sm">
          {t('gallery.no_search_results_description', { query: searchQuery })}
        </p>
        <Button variant="outline" onClick={onClearSearch}>
          {t('gallery.clear_search')}
        </Button>
      </div>
    );
  }

  if (visibility !== 'public') {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Bookmark className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="mb-2 font-semibold text-lg">
          {t('gallery.no_filter_results')}
        </h3>
        <p className="mb-4 text-muted-foreground text-sm">
          {t('gallery.no_filter_results_description')}
        </p>
        <Button variant="outline" onClick={onClearFilter}>
          {t('gallery.show_all_templates')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <div className="mb-4 rounded-full bg-primary/10 p-4">
        <Bookmark className="h-8 w-8 text-primary" />
      </div>
      <h3 className="mb-2 font-semibold text-lg">{t('gallery.empty_title')}</h3>
      <p className="mb-4 max-w-sm text-muted-foreground text-sm">
        {t('gallery.empty_description')}
      </p>
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Plus className="h-4 w-4" />
        <span>{t('gallery.empty_hint')}</span>
      </div>
    </div>
  );
}
