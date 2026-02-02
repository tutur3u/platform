'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
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
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface TagManagerProps {
  wsId: string;
}

interface TransactionTag {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

const tagFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format'),
  description: z.string().optional(),
});

type TagFormValues = z.infer<typeof tagFormSchema>;

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
];

export function TagManager({ wsId }: TagManagerProps) {
  const t = useTranslations();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TransactionTag | null>(null);
  const [tagToDelete, setTagToDelete] = useState<TransactionTag | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();
  const supabase = createClient();
  const router = useRouter();

  const { data: tags, isLoading } = useQuery({
    queryKey: ['transaction_tags', wsId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transaction_tags')
        .select('*')
        .eq('ws_id', wsId)
        .order('name');

      if (error) throw error;
      return data as TransactionTag[];
    },
  });

  const { data: tagStats } = useQuery({
    queryKey: ['transaction_tag_stats', wsId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'get_transaction_count_by_tag',
        { _ws_id: wsId }
      );

      if (error) throw error;
      return data as Array<{
        tag_id: string;
        tag_name: string;
        tag_color: string;
        transaction_count: number;
      }>;
    },
  });

  const filteredTags = useMemo(() => {
    if (!tags) return [];
    if (!searchQuery.trim()) return tags;
    const query = searchQuery.toLowerCase();
    return tags.filter(
      (tag) =>
        tag.name.toLowerCase().includes(query) ||
        tag.description?.toLowerCase().includes(query)
    );
  }, [tags, searchQuery]);

  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: {
      name: '',
      color: PRESET_COLORS[0],
      description: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TagFormValues) => {
      const { error } = await supabase.from('transaction_tags').insert([
        {
          ws_id: wsId,
          name: data.name,
          color: data.color,
          description: data.description || null,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('ws-transaction-tags.create_success'));
      queryClient.invalidateQueries({ queryKey: ['transaction_tags', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['transaction_tag_stats', wsId],
      });
      form.reset();
      setIsDialogOpen(false);
    },
    onError: () => {
      toast.error(t('ws-transaction-tags.create_error'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TagFormValues }) => {
      const { error } = await supabase
        .from('transaction_tags')
        .update({
          name: data.name,
          color: data.color,
          description: data.description || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('ws-transaction-tags.update_success'));
      queryClient.invalidateQueries({ queryKey: ['transaction_tags', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['transaction_tag_stats', wsId],
      });
      setEditingTag(null);
      setIsDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast.error(t('ws-transaction-tags.update_error'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase
        .from('transaction_tags')
        .delete()
        .eq('id', tagId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('ws-transaction-tags.delete_success'));
      queryClient.invalidateQueries({ queryKey: ['transaction_tags', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['transaction_tag_stats', wsId],
      });
      setTagToDelete(null);
    },
    onError: () => {
      toast.error(t('ws-transaction-tags.delete_error'));
    },
  });

  const handleTagClick = (tagId: string) => {
    router.push(`/${wsId}/finance/transactions?tagIds=${tagId}`);
  };

  const handleOpenCreate = () => {
    setEditingTag(null);
    form.reset({
      name: '',
      color: PRESET_COLORS[0],
      description: '',
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (tag: TransactionTag) => {
    setEditingTag(tag);
    form.reset({
      name: tag.name,
      color: tag.color,
      description: tag.description || '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: TagFormValues) => {
    if (editingTag) {
      updateMutation.mutate({ id: editingTag.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div className="w-full">
          <h1 className="w-full font-bold text-2xl">
            {t('ws-transaction-tags.plural')}
          </h1>
          <div className="whitespace-pre-wrap text-foreground/80">
            {t('ws-transaction-tags.description')}
          </div>
        </div>
        <Button
          size="xs"
          className="w-full md:w-fit"
          onClick={handleOpenCreate}
        >
          <Plus className="mr-1 h-5 w-5" />
          {t('ws-transaction-tags.create')}
        </Button>
      </div>

      <Separator />

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('ws-transaction-tags.search_placeholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tags Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="h-6 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                </div>
                <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
                <div className="mt-2 h-4 w-20 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredTags.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTags.map((tag) => {
            const stats = tagStats?.find((s) => s.tag_id === tag.id);
            return (
              <Card
                key={tag.id}
                className="group relative cursor-pointer overflow-hidden transition-all hover:shadow-md"
                onClick={() => handleTagClick(tag.id)}
              >
                {/* Color accent bar */}
                <div
                  className="absolute top-0 right-0 left-0 h-1"
                  style={{ backgroundColor: tag.color }}
                />
                <CardContent className="p-4 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <Badge
                        variant="outline"
                        className="text-sm"
                        style={{
                          borderColor: tag.color,
                          color: tag.color,
                          backgroundColor: `${tag.color}15`,
                        }}
                      >
                        <Tag className="mr-1 h-3 w-3" />
                        {tag.name}
                      </Badge>
                      {tag.description && (
                        <p className="line-clamp-2 text-muted-foreground text-sm">
                          {tag.description}
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTagClick(tag.id);
                          }}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {t('ws-transaction-tags.view_transactions')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(tag);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {t('common.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-dynamic-red focus:text-dynamic-red"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTagToDelete(tag);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t('ws-transaction-tags.transaction_count', {
                        count: stats?.transaction_count || 0,
                      })}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 font-medium text-xs"
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                      }}
                    >
                      {stats?.transaction_count || 0}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Tag className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 font-semibold text-lg">
              {searchQuery
                ? t('common.no-results')
                : t('ws-transaction-tags.empty_title')}
            </h3>
            <p className="mb-4 max-w-sm text-center text-muted-foreground text-sm">
              {searchQuery
                ? t('ws-transaction-tags.search_empty')
                : t('ws-transaction-tags.empty_description')}
            </p>
            {!searchQuery && (
              <Button onClick={handleOpenCreate}>
                <Plus className="mr-2 h-4 w-4" />
                {t('ws-transaction-tags.create')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTag
                ? t('ws-transaction-tags.edit')
                : t('ws-transaction-tags.create')}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('ws-transaction-tags.name')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('ws-transaction-tags.name_placeholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('ws-transaction-tags.description_label')}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t(
                          'ws-transaction-tags.description_placeholder'
                        )}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('ws-transaction-tags.color')}</FormLabel>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={cn(
                              'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                              field.value === color
                                ? 'border-foreground ring-2 ring-offset-2'
                                : 'border-transparent'
                            )}
                            style={{ backgroundColor: color }}
                            onClick={() => field.onChange(color)}
                          />
                        ))}
                      </div>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-8 w-8 rounded-full border"
                            style={{ backgroundColor: field.value }}
                          />
                          <Input
                            type="color"
                            {...field}
                            className="h-8 w-20 cursor-pointer p-0"
                          />
                          <Input
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder="#000000"
                            className="w-24 font-mono text-sm"
                          />
                        </div>
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : editingTag ? (
                  t('common.save')
                ) : (
                  t('ws-transaction-tags.create')
                )}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!tagToDelete}
        onOpenChange={(open) => !open && setTagToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-transaction-tags.delete_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('ws-transaction-tags.delete_confirm_description')}
              {tagToDelete && (
                <span className="mt-2 block">
                  <Badge
                    variant="outline"
                    style={{
                      borderColor: tagToDelete.color,
                      color: tagToDelete.color,
                      backgroundColor: `${tagToDelete.color}15`,
                    }}
                  >
                    <Tag className="mr-1 h-3 w-3" />
                    {tagToDelete.name}
                  </Badge>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                tagToDelete && deleteMutation.mutate(tagToDelete.id)
              }
              disabled={deleteMutation.isPending}
              className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.deleting')}
                </>
              ) : (
                t('common.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
