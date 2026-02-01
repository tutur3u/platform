'use client';

import {
  ArrowDownAZ,
  ArrowUpAZ,
  Bookmark,
  Calendar,
  Globe,
  KanbanSquare,
  ListTodo,
  Search,
  Tags,
  X,
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
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { BoardTemplate } from '../types';

type SortOption = 'title-asc' | 'title-desc' | 'created-desc' | 'created-asc';

interface Props {
  wsId: string;
  templates: BoardTemplate[];
}

export default function MarketplaceClient({ wsId, templates }: Props) {
  const t = useTranslations('ws-board-templates');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('created-desc');

  // Filter and sort templates
  const filteredAndSortedTemplates = useMemo(() => {
    let filtered = templates;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (tmpl) =>
          tmpl.name.toLowerCase().includes(query) ||
          tmpl.description?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'title-asc':
          return a.name.localeCompare(b.name);
        case 'title-desc':
          return b.name.localeCompare(a.name);
        case 'created-desc':
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case 'created-asc':
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        default:
          return 0;
      }
    });

    return sorted;
  }, [templates, searchQuery, sortBy]);

  const featuredTemplates = filteredAndSortedTemplates.slice(0, 2);
  const hasSearchQuery = searchQuery.trim().length > 0;

  return (
    <div className="space-y-8">
      {/* Search & Sort Controls */}
      <Card className="border-border/50 bg-linear-to-br from-background via-dynamic-purple/5 to-dynamic-blue/5">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap gap-4">
            {/* Search Bar */}
            <div className="relative w-64">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-dynamic-blue" />
              <Input
                placeholder={t('marketplace.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 pl-10"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  onClick={() => setSearchQuery('')}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-dynamic-red"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Sort Dropdown */}
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as SortOption)}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created-desc">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-dynamic-green" />
                    <span>{t('marketplace.sort_created_desc')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="created-asc">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-dynamic-orange" />
                    <span>{t('marketplace.sort_created_asc')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="title-asc">
                  <div className="flex items-center gap-2">
                    <ArrowDownAZ className="h-4 w-4 text-dynamic-blue" />
                    <span>{t('marketplace.sort_title_asc')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="title-desc">
                  <div className="flex items-center gap-2">
                    <ArrowUpAZ className="h-4 w-4 text-dynamic-purple" />
                    <span>{t('marketplace.sort_title_desc')}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results Count */}
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Globe className="h-4 w-4 text-dynamic-cyan" />
            <span>
              {t('marketplace.results_count', {
                count: filteredAndSortedTemplates.length,
              })}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Featured Templates Section */}
      {featuredTemplates.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-xl tracking-tight">
              {t('marketplace.featured_label')}
            </h2>
            <Badge
              variant="secondary"
              className="bg-linear-to-r from-dynamic-purple/10 to-dynamic-pink/10 text-dynamic-purple"
            >
              {t('marketplace.featured_badge')}
            </Badge>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {featuredTemplates.map((template, idx) => (
              <FeaturedTemplateCard
                key={template.id}
                template={template}
                wsId={wsId}
                index={idx}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Templates Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-xl tracking-tight">
            {t('marketplace.all_templates')}
          </h2>
          <Badge variant="secondary" className="px-2 font-mono text-xs">
            {filteredAndSortedTemplates.length}
          </Badge>
        </div>

        {filteredAndSortedTemplates.length === 0 ? (
          <EmptyState
            hasSearch={hasSearchQuery}
            onClearSearch={() => setSearchQuery('')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredAndSortedTemplates.map((template) => (
              <MarketplaceTemplateCard
                key={template.id}
                template={template}
                wsId={wsId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturedTemplateCard({
  template,
  wsId,
  index,
}: {
  template: BoardTemplate;
  wsId: string;
  index: number;
}) {
  return (
    <Link href={`/${wsId}/tasks/templates/${template.id}`}>
      <Card className="group relative h-full overflow-hidden border-border/50 bg-linear-to-br from-background via-background to-muted/30 transition-all hover:border-primary/50 hover:shadow-xl">
        {/* Gradient overlay on hover */}
        <div
          className={cn(
            'absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100',
            index === 0
              ? 'bg-linear-to-br from-dynamic-purple/5 via-transparent to-dynamic-blue/5'
              : 'bg-linear-to-br from-dynamic-blue/5 via-transparent to-dynamic-green/5'
          )}
        />

        <CardHeader className="relative space-y-4 pb-4">
          <div className="flex items-center justify-between">
            <Badge
              variant="secondary"
              className={cn(
                'bg-background/80 font-semibold backdrop-blur-sm',
                index === 0 ? 'text-dynamic-purple' : 'text-dynamic-blue'
              )}
            >
              ⭐ Featured
            </Badge>
            <span className="text-muted-foreground text-xs">
              {formatDistanceToNow(new Date(template.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>

          <div className="space-y-2">
            <CardTitle className="font-bold text-2xl leading-tight transition-colors group-hover:text-primary">
              {template.name}
            </CardTitle>
            {template.description && (
              <CardDescription className="line-clamp-3 text-base leading-relaxed">
                {template.description}
              </CardDescription>
            )}
          </div>
        </CardHeader>

        <CardContent className="relative">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 rounded-full bg-linear-to-r from-dynamic-blue/10 to-dynamic-cyan/10 px-3 py-1.5 text-sm">
              <KanbanSquare className="h-4 w-4 text-dynamic-blue" />
              <span className="font-medium">
                {template.stats.lists}{' '}
                <span className="text-muted-foreground">lists</span>
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-linear-to-r from-dynamic-green/10 to-dynamic-teal/10 px-3 py-1.5 text-sm">
              <ListTodo className="h-4 w-4 text-dynamic-green" />
              <span className="font-medium">
                {template.stats.tasks}{' '}
                <span className="text-muted-foreground">tasks</span>
              </span>
            </div>
            {template.stats.labels > 0 && (
              <div className="flex items-center gap-2 rounded-full bg-linear-to-r from-dynamic-orange/10 to-dynamic-yellow/10 px-3 py-1.5 text-sm">
                <Tags className="h-4 w-4 text-dynamic-orange" />
                <span className="font-medium">
                  {template.stats.labels}{' '}
                  <span className="text-muted-foreground">labels</span>
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function MarketplaceTemplateCard({
  template,
  wsId,
}: {
  template: BoardTemplate;
  wsId: string;
}) {
  return (
    <Link href={`/${wsId}/tasks/templates/${template.id}`}>
      <Card className="group h-full overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-dynamic-blue/10 p-2.5 transition-colors group-hover:from-dynamic-purple/20 group-hover:to-dynamic-blue/20">
              <Bookmark className="h-5 w-5 text-dynamic-purple" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="line-clamp-2 text-base leading-tight transition-colors group-hover:text-dynamic-blue">
                {template.name}
              </CardTitle>
              <span className="text-muted-foreground text-xs">
                {formatDistanceToNow(new Date(template.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
          {template.description && (
            <CardDescription className="line-clamp-2 pt-2 text-xs leading-relaxed">
              {template.description}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-3 border-border/50 border-t pt-3 text-muted-foreground text-xs">
            <div className="flex items-center gap-1.5">
              <KanbanSquare className="h-3.5 w-3.5 text-dynamic-blue" />
              <span>{template.stats.lists}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ListTodo className="h-3.5 w-3.5 text-dynamic-green" />
              <span>{template.stats.tasks}</span>
            </div>
            {template.stats.labels > 0 && (
              <div className="flex items-center gap-1.5">
                <Tags className="h-3.5 w-3.5 text-dynamic-orange" />
                <span>{template.stats.labels}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({
  hasSearch,
  onClearSearch,
}: {
  hasSearch: boolean;
  onClearSearch: () => void;
}) {
  const t = useTranslations('ws-board-templates');

  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center">
        <div className="mb-4 rounded-full bg-linear-to-br from-dynamic-blue/10 to-dynamic-purple/10 p-4">
          <Search className="h-8 w-8 text-dynamic-blue" />
        </div>
        <h3 className="mb-2 font-semibold text-lg">
          {t('marketplace.no_results_title')}
        </h3>
        <p className="mb-4 max-w-md text-muted-foreground text-sm">
          {t('marketplace.no_results_description')}
        </p>
        <Button variant="outline" onClick={onClearSearch} className="gap-2">
          <X className="h-4 w-4" />
          {t('marketplace.clear_search')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center">
      <div className="mb-4 rounded-full bg-linear-to-br from-dynamic-purple/10 to-dynamic-pink/10 p-4">
        <Globe className="h-8 w-8 text-dynamic-purple" />
      </div>
      <h3 className="mb-2 font-semibold text-lg">
        {t('marketplace.empty_title')}
      </h3>
      <p className="max-w-md text-muted-foreground text-sm">
        {t('marketplace.empty_description')}
      </p>
    </div>
  );
}
