'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bookmark,
  Globe,
  KanbanSquare,
  ListTodo,
  Loader2,
  Lock,
  Plus,
  Search,
  Tags,
  Users,
} from '@tuturuuu/icons';
import { listWorkspaceTaskBoards } from '@tuturuuu/internal-api';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { SaveAsTemplateDialog } from './save-as-template-dialog';
import type { BoardTemplate, TemplateFilter } from './types';

interface Props {
  wsId: string;
  initialTemplates: BoardTemplate[];
  templatesBasePath?: string;
}

type TemplateSourceBoard = Pick<WorkspaceTaskBoard, 'id' | 'name' | 'ws_id'>;

export default function TemplatesClient({
  wsId,
  initialTemplates,
  templatesBasePath = 'templates',
}: Props) {
  const t = useTranslations('ws-board-templates');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibility, setVisibility] = useState<TemplateFilter>('workspace');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedBoard, setSelectedBoard] =
    useState<TemplateSourceBoard | null>(null);

  const { data: availableBoards = [], isLoading: isBoardsLoading } = useQuery({
    queryKey: ['template-source-boards', wsId],
    queryFn: async (): Promise<TemplateSourceBoard[]> => {
      const payload = await listWorkspaceTaskBoards(wsId);
      return payload.boards.filter(
        (board) => !board.deleted_at && !board.archived_at
      );
    },
    enabled: pickerOpen,
  });

  // Client-side filtering
  const filteredTemplates = useMemo(() => {
    let filtered = initialTemplates;

    // Filter by visibility
    if (visibility === 'private') {
      filtered = filtered.filter((t) => t.visibility === 'private');
    }

    if (!searchQuery.trim()) return filtered;

    const query = searchQuery.toLowerCase();
    return filtered.filter(
      (tmpl) =>
        tmpl.name.toLowerCase().includes(query) ||
        tmpl.description?.toLowerCase().includes(query)
    );
  }, [initialTemplates, searchQuery, visibility]);

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <p className="font-medium text-sm leading-none">
                {t('gallery.search_label')}
              </p>
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
              <p className="font-medium text-sm leading-none">
                {t('gallery.visibility_label')}
              </p>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as TemplateFilter)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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

            <div className="flex items-end">
              <Button onClick={() => setPickerOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                {t('gallery.create_template')}
              </Button>
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
          visibility={visibility}
          onClearSearch={() => setSearchQuery('')}
          onClearFilter={() => setVisibility('workspace')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              wsId={wsId}
              templatesBasePath={templatesBasePath}
            />
          ))}
        </div>
      )}

      <ChooseSourceBoardDialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) {
            setSelectedBoardId('');
          }
        }}
        isLoading={isBoardsLoading}
        boards={availableBoards}
        selectedBoardId={selectedBoardId}
        onSelectBoard={setSelectedBoardId}
        onContinue={() => {
          const board = availableBoards.find(
            (item) => item.id === selectedBoardId
          );
          if (!board) return;

          setSelectedBoard(board);
          setPickerOpen(false);
          setSaveDialogOpen(true);
        }}
      />

      {selectedBoard && (
        <SaveAsTemplateDialog
          board={selectedBoard}
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
        />
      )}
    </div>
  );
}

interface TemplateCardProps {
  template: BoardTemplate;
  wsId: string;
  templatesBasePath: string;
}

function TemplateCard({
  template,
  wsId,
  templatesBasePath,
}: TemplateCardProps) {
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
    <Link href={`/${wsId}/${templatesBasePath}/${template.id}`}>
      <Card className="h-full overflow-hidden transition-all hover:border-primary/50 hover:shadow-md">
        <div className="aspect-video w-full overflow-hidden border-b bg-muted/30">
          {template.backgroundUrl ? (
            <Image
              src={template.backgroundUrl}
              alt={template.name}
              width={400}
              height={225}
              className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <KanbanSquare className="h-10 w-10 text-muted-foreground/20" />
            </div>
          )}
        </div>
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

interface ChooseSourceBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  boards: TemplateSourceBoard[];
  selectedBoardId: string;
  onSelectBoard: (boardId: string) => void;
  onContinue: () => void;
}

function ChooseSourceBoardDialog({
  open,
  onOpenChange,
  isLoading,
  boards,
  selectedBoardId,
  onSelectBoard,
  onContinue,
}: ChooseSourceBoardDialogProps) {
  const t = useTranslations('ws-board-templates');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('gallery.create_template')}</DialogTitle>
          <DialogDescription>
            {t('gallery.create_template_description')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span>{t('gallery.loading_boards')}</span>
          </div>
        ) : boards.length === 0 ? (
          <div className="space-y-1 rounded-md border border-dashed px-4 py-6 text-center">
            <p className="font-medium text-sm">
              {t('gallery.no_boards_available')}
            </p>
            <p className="text-muted-foreground text-sm">
              {t('gallery.no_boards_available_description')}
            </p>
          </div>
        ) : (
          <div className="space-y-2 py-2">
            <p className="font-medium text-sm leading-none">
              {t('gallery.choose_board_label')}
            </p>
            <Combobox
              mode="single"
              options={boards.map((board) => ({
                value: board.id,
                label: board.name || t('gallery.unnamed_board'),
              }))}
              selected={selectedBoardId}
              onChange={(value) => onSelectBoard(value as string)}
              placeholder={t('gallery.choose_board_placeholder')}
              searchPlaceholder={t('gallery.search_boards_placeholder')}
              emptyText={t('gallery.no_matching_boards')}
              className="w-full"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={onContinue}
            disabled={boards.length === 0 || !selectedBoardId}
          >
            {t('gallery.continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  if (visibility === 'private') {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Lock className="mb-4 h-12 w-12 text-muted-foreground/50" />
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
