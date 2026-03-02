'use client';

import {
  Archive,
  ArrowUpDown,
  Calendar,
  Grid3X3,
  LayoutPanelTop,
  LetterText,
  List,
  MoreHorizontal,
  Pen,
  Pencil,
  RefreshCw,
  Search,
  Trash,
  UserIcon,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Toggle } from '@tuturuuu/ui/toggle';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import EditWhiteboardDialog from './editWhiteboardDialog';

type SortOption = 'alphabetical' | 'dateCreated' | 'lastModified';
type ViewMode = 'grid' | 'list';

export interface Whiteboard {
  id: string;
  title: string;
  description?: string;
  dateCreated: Date;
  lastModified: Date;
  creatorName: string;
  archivedAt?: Date;
}

interface WhiteboardsListProps {
  wsId: string;
  whiteboards: Whiteboard[];
}

export default function WhiteboardsList({
  wsId,
  whiteboards,
}: WhiteboardsListProps) {
  const t = useTranslations('common');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('lastModified');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  const getSortLabel = (option: SortOption) => {
    switch (option) {
      case 'alphabetical':
        return t('alphabetical');
      case 'dateCreated':
        return t('dateCreated');
      case 'lastModified':
        return t('lastModified');
    }
  };

  const getSortIcon = (option: SortOption) => {
    switch (option) {
      case 'alphabetical':
        return <LetterText className="h-4 w-4" />;
      case 'dateCreated':
        return <Calendar className="h-4 w-4" />;
      case 'lastModified':
        return <Pen className="h-4 w-4" />;
    }
  };

  const filteredWhiteboards = whiteboards.filter((whiteboard) => {
    const matchesSearch = whiteboard.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesTab =
      activeTab === 'archived'
        ? !!whiteboard.archivedAt
        : !whiteboard.archivedAt;
    return matchesSearch && matchesTab;
  });

  const sortedWhiteboards = [...filteredWhiteboards].sort((a, b) => {
    switch (sortBy) {
      case 'alphabetical':
        return a.title.localeCompare(b.title);
      case 'dateCreated':
        return b.dateCreated.getTime() - a.dateCreated.getTime();
      case 'lastModified':
        return b.lastModified.getTime() - a.lastModified.getTime();
      default:
        return 0;
    }
  });

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffInDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffInDays === 0) return t('today');
    if (diffInDays === 1) return t('yesterday');
    if (diffInDays < 7) return t('days_ago', { count: diffInDays });
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              <LayoutPanelTop className="h-4 w-4" />
              {t('active')}
            </TabsTrigger>
            <TabsTrigger value="archived" className="gap-2">
              <Archive className="h-4 w-4" />
              {t('archived')}
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 sm:min-w-64">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
              <Input
                placeholder={t('search_tasks')} // Reusing search_tasks for now
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  {getSortIcon(sortBy)}
                  <span className="hidden sm:inline">
                    {t('sort')}: {getSortLabel(sortBy)}
                  </span>
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setSortBy('alphabetical')}
                  className="gap-2"
                >
                  <LetterText className="h-4 w-4" />
                  {t('alphabetical')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy('dateCreated')}
                  className="gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  {t('dateCreated')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy('lastModified')}
                  className="gap-2"
                >
                  <Pen className="h-4 w-4" />
                  {t('lastModified')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border">
              <Toggle
                pressed={viewMode === 'grid'}
                onPressedChange={() => setViewMode('grid')}
                className="rounded-r-none"
                size="sm"
              >
                <Grid3X3 className="h-4 w-4" />
              </Toggle>
              <Toggle
                pressed={viewMode === 'list'}
                onPressedChange={() => setViewMode('list')}
                className="rounded-l-none border-l"
                size="sm"
              >
                <List className="h-4 w-4" />
              </Toggle>
            </div>
          </div>
        </div>

        <TabsContent value="active" className="mt-6">
          <WhiteboardGrid
            wsId={wsId}
            whiteboards={sortedWhiteboards}
            viewMode={viewMode}
            formatDate={formatDate}
            searchQuery={searchQuery}
            t={t}
          />
        </TabsContent>

        <TabsContent value="archived" className="mt-6">
          <WhiteboardGrid
            wsId={wsId}
            whiteboards={sortedWhiteboards}
            viewMode={viewMode}
            formatDate={formatDate}
            searchQuery={searchQuery}
            t={t}
            isArchivedView
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface WhiteboardGridProps {
  wsId: string;
  whiteboards: Whiteboard[];
  viewMode: ViewMode;
  formatDate: (date: Date) => string;
  searchQuery: string;
  t: any;
  isArchivedView?: boolean;
}

function WhiteboardGrid({
  wsId,
  whiteboards,
  viewMode,
  formatDate,
  searchQuery,
  t,
  isArchivedView,
}: WhiteboardGridProps) {
  if (whiteboards.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center py-12 text-center">
        <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-muted">
          {isArchivedView ? (
            <Archive className="h-8 w-8 text-muted-foreground" />
          ) : (
            <Search className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <h3 className="mb-2 font-semibold text-lg">
          {isArchivedView
            ? t('no_archived_whiteboards')
            : t('no_whiteboards_found')}
        </h3>
        <p className="mb-4 max-w-xs text-muted-foreground">
          {searchQuery
            ? t('no_results_found')
            : isArchivedView
              ? t('no_archived_whiteboards_description')
              : t('whiteboards_description')}
        </p>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {whiteboards.map((whiteboard) => (
          <Link
            key={whiteboard.id}
            href={`/${wsId}/whiteboards/${whiteboard.id}`}
            className="block"
          >
            <Card className="group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br from-violet-500/10 to-purple-500/10 transition-colors group-hover:from-violet-500/20 group-hover:to-purple-500/20">
                      <LayoutPanelTop className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <CardTitle className="line-clamp-1 text-base">
                      {whiteboard.title}
                    </CardTitle>
                  </div>
                  <CardAction whiteboard={whiteboard} t={t} />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {whiteboard.description && (
                  <p className="mb-3 line-clamp-2 text-muted-foreground text-sm">
                    {whiteboard.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-muted-foreground text-xs">
                  <div className="flex items-center gap-1">
                    <UserIcon className="h-3 w-3" />
                    <span className="max-w-24 truncate">
                      {whiteboard.creatorName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Pen className="h-3 w-3" />
                    {formatDate(whiteboard.lastModified)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {whiteboards.map((whiteboard) => (
        <Link
          key={whiteboard.id}
          href={`/${wsId}/whiteboards/${whiteboard.id}`}
          className="block"
        >
          <Card className="group cursor-pointer transition-all duration-200 hover:bg-muted/50">
            <CardContent className="flex items-center gap-4 p-4">
              {/* Icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-violet-500/10 to-purple-500/10">
                <LayoutPanelTop className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold">{whiteboard.title}</h3>
                {whiteboard.description && (
                  <p className="truncate text-muted-foreground text-sm">
                    {whiteboard.description}
                  </p>
                )}
              </div>

              {/* Metadata */}
              <div className="hidden items-center gap-6 text-muted-foreground text-sm md:flex">
                <div className="flex items-center gap-1">
                  <UserIcon className="h-3 w-3" />
                  <span className="max-w-20 truncate">
                    {whiteboard.creatorName}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Pen className="h-3 w-3" />
                  {formatDate(whiteboard.lastModified)}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(whiteboard.dateCreated)}
                </div>
              </div>

              <CardAction whiteboard={whiteboard} t={t} />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function CardAction({ whiteboard, t }: { whiteboard: Whiteboard; t: any }) {
  const supabase = createClient();
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  const handleDelete = async (whiteboard: Whiteboard) => {
    try {
      const { error } = await supabase
        .from('workspace_whiteboards')
        .delete()
        .eq('id', whiteboard.id);

      if (error) {
        throw new Error('Failed to delete whiteboard');
      }

      toast.success(t('delete_whiteboard_success'));
      router.refresh();
    } catch (error) {
      console.error('Error deleting whiteboard:', error);
      toast.error(t('delete_whiteboard_error'));
    }
  };

  const handleArchiveToggle = async (whiteboard: Whiteboard) => {
    try {
      const isArchiving = !whiteboard.archivedAt;
      const { error } = await supabase
        .from('workspace_whiteboards')
        .update({
          archived_at: isArchiving ? new Date().toISOString() : null,
        })
        .eq('id', whiteboard.id);

      if (error) {
        throw new Error(
          isArchiving
            ? 'Failed to archive whiteboard'
            : 'Failed to unarchive whiteboard'
        );
      }

      toast.success(
        isArchiving ? t('archive_success') : t('unarchive_success')
      );
      router.refresh();
    } catch (error) {
      console.error('Error toggling archive status:', error);
      toast.error(t('error_occurred'));
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <EditWhiteboardDialog
            whiteboard={whiteboard}
            trigger={
              <DropdownMenuItem
                className="gap-2"
                onSelect={(e) => e.preventDefault()}
                onClick={(e) => e.stopPropagation()}
              >
                <Pencil className="h-4 w-4" />
                {t('edit')}
              </DropdownMenuItem>
            }
          />
          <DropdownMenuItem
            className="gap-2"
            onSelect={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              setShowArchiveDialog(true);
            }}
          >
            {whiteboard.archivedAt ? (
              <>
                <RefreshCw className="h-4 w-4" />
                {t('unarchive')}
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" />
                {t('archive')}
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onSelect={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteDialog(true);
            }}
          >
            <Trash className="h-4 w-4" />
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {whiteboard.archivedAt
                ? t('unarchive_whiteboard_title')
                : t('archive_whiteboard_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {whiteboard.archivedAt
                ? t('unarchive_whiteboard_description', {
                    title: whiteboard.title,
                  })
                : t('archive_whiteboard_description', {
                    title: whiteboard.title,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                handleArchiveToggle(whiteboard);
                setShowArchiveDialog(false);
              }}
            >
              {whiteboard.archivedAt ? t('unarchive') : t('archive')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm_delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_task_confirmation', { name: whiteboard.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(whiteboard);
                setShowDeleteDialog(false);
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
