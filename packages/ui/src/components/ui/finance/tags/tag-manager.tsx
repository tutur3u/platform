'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Tag, Trash2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useState } from 'react';
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const supabase = createClient();

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
        {
          _ws_id: wsId,
        }
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

  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: {
      name: '',
      color: PRESET_COLORS[0],
      description: '',
    },
  });

  const onSubmit = async (data: TagFormValues) => {
    try {
      const { error } = await supabase.from('transaction_tags').insert([
        {
          ws_id: wsId,
          name: data.name,
          color: data.color,
          description: data.description || null,
        },
      ]);

      if (error) throw error;

      toast.success('Tag created successfully');
      queryClient.invalidateQueries({ queryKey: ['transaction_tags', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['transaction_tag_stats', wsId],
      });

      form.reset();
      setIsCreateDialogOpen(false);
    } catch (error) {
      console.error('Error creating tag:', error);
      toast.error('Failed to create tag');
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    try {
      const { error } = await supabase
        .from('transaction_tags')
        .delete()
        .eq('id', tagId);

      if (error) throw error;

      toast.success('Tag deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['transaction_tags', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['transaction_tag_stats', wsId],
      });
    } catch (error) {
      console.error('Error deleting tag:', error);
      toast.error('Failed to delete tag');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl">Transaction Tags</h1>
          <p className="text-muted-foreground text-sm">
            Organize transactions with custom tags
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Tag
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Tag</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Personal" {...field} />
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
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Tag description" {...field} />
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
                      <FormLabel>Color</FormLabel>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className="h-8 w-8 rounded-full border-2 border-transparent hover:scale-110"
                              style={{
                                backgroundColor: color,
                                borderColor:
                                  field.value === color
                                    ? 'hsl(var(--foreground))'
                                    : 'transparent',
                              }}
                              onClick={() => field.onChange(color)}
                            />
                          ))}
                        </div>
                        <FormControl>
                          <Input type="color" {...field} />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full">
                  Create Tag
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tags && tags.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) => {
            const stats = tagStats?.find((s) => s.tag_id === tag.id);
            return (
              <Card key={tag.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: tag.color,
                        color: tag.color,
                        backgroundColor: `${tag.color}15`,
                      }}
                    >
                      <Tag className="mr-1 h-3 w-3" />
                      {tag.name}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTag(tag.id)}
                    >
                      <Trash2 className="h-4 w-4 text-dynamic-red" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {tag.description && (
                    <p className="text-muted-foreground text-sm">
                      {tag.description}
                    </p>
                  )}
                  <p className="text-sm">
                    <span className="font-medium">
                      {stats?.transaction_count || 0}
                    </span>{' '}
                    transactions
                  </p>
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
            <h3 className="mb-2 font-semibold text-lg">No tags yet</h3>
            <p className="mb-4 text-muted-foreground text-sm">
              Create your first tag to organize transactions
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Tag
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
