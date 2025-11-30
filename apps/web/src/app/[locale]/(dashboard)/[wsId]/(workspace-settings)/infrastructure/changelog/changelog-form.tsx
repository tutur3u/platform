'use client';

import type { JSONContent } from '@tiptap/react';
import {
  AlertTriangle,
  Bug,
  Loader2,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
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
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { CoverImageUpload } from './cover-image-upload';

interface ChangelogEntry {
  id?: string;
  title: string;
  slug: string;
  content: JSONContent;
  summary: string | null;
  category: string;
  version: string | null;
  cover_image_url: string | null;
  is_published: boolean;
  published_at: string | null;
}

interface ChangelogFormProps {
  wsId: string;
  initialData?: ChangelogEntry;
  isEditing?: boolean;
}

const categories = [
  {
    value: 'feature',
    label: 'New Feature',
    icon: <Sparkles className="h-4 w-4" />,
    description: 'New functionality or capability',
  },
  {
    value: 'improvement',
    label: 'Improvement',
    icon: <TrendingUp className="h-4 w-4" />,
    description: 'Enhancement to existing features',
  },
  {
    value: 'bugfix',
    label: 'Bug Fix',
    icon: <Bug className="h-4 w-4" />,
    description: 'Fix for a bug or issue',
  },
  {
    value: 'breaking',
    label: 'Breaking Change',
    icon: <AlertTriangle className="h-4 w-4" />,
    description: 'Changes that may break existing functionality',
  },
  {
    value: 'security',
    label: 'Security',
    icon: <Shield className="h-4 w-4" />,
    description: 'Security improvements or fixes',
  },
  {
    value: 'performance',
    label: 'Performance',
    icon: <Zap className="h-4 w-4" />,
    description: 'Performance optimizations',
  },
];

const defaultContent: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [],
    },
  ],
};

export function ChangelogForm({
  wsId,
  initialData,
  isEditing = false,
}: ChangelogFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const [title, setTitle] = useState(initialData?.title || '');
  const [slug, setSlug] = useState(initialData?.slug || '');
  const [content, setContent] = useState<JSONContent | null>(
    initialData?.content || defaultContent
  );
  const [summary, setSummary] = useState(initialData?.summary || '');
  const [category, setCategory] = useState(initialData?.category || 'feature');
  const [version, setVersion] = useState(initialData?.version || '');
  const [coverImageUrl, setCoverImageUrl] = useState(
    initialData?.cover_image_url || ''
  );

  const isPublished = initialData?.is_published || false;

  // Auto-generate slug from title
  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    // Only auto-generate slug if it's a new entry or slug hasn't been manually edited
    if (!isEditing || slug === generateSlug(initialData?.title || '')) {
      setSlug(generateSlug(newTitle));
    }
  };

  const handleImageUpload = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/v1/infrastructure/changelog/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to upload image');
    }

    const result = await response.json();
    return result.url;
  }, []);

  const handleSave = async (publish = false) => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!slug.trim()) {
      toast.error('Slug is required');
      return;
    }

    if (!content) {
      toast.error('Content is required');
      return;
    }

    setIsLoading(true);
    if (publish) setIsPublishing(true);

    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim(),
        content,
        summary: summary.trim() || null,
        category,
        version: version.trim() || null,
        cover_image_url: coverImageUrl.trim() || null,
      };

      let response: Response;

      if (isEditing && initialData?.id) {
        // Update existing entry
        response = await fetch(
          `/api/v1/infrastructure/changelog/${initialData.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
      } else {
        // Create new entry
        response = await fetch('/api/v1/infrastructure/changelog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save changelog');
      }

      const savedEntry = await response.json();

      // If publish flag is set, publish the entry
      if (publish) {
        const publishResponse = await fetch(
          `/api/v1/infrastructure/changelog/${savedEntry.id}/publish`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_published: true }),
          }
        );

        if (!publishResponse.ok) {
          const error = await publishResponse.json();
          throw new Error(error.message || 'Failed to publish changelog');
        }

        toast.success('Changelog published successfully');
      } else {
        toast.success(
          isEditing ? 'Changelog updated' : 'Changelog created as draft'
        );
      }

      router.push(`/${wsId}/infrastructure/changelog`);
      router.refresh();
    } catch (error) {
      console.error('Error saving changelog:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save changelog'
      );
    } finally {
      setIsLoading(false);
      setIsPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!initialData?.id) return;

    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/v1/infrastructure/changelog/${initialData.id}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_published: false }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to unpublish changelog');
      }

      toast.success('Changelog unpublished');
      router.refresh();
    } catch (error) {
      console.error('Error unpublishing changelog:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to unpublish changelog'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!initialData?.id) return;

    if (
      !confirm(
        'Are you sure you want to delete this changelog entry? This action cannot be undone.'
      )
    ) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/v1/infrastructure/changelog/${initialData.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete changelog');
      }

      toast.success('Changelog deleted');
      router.push(`/${wsId}/infrastructure/changelog`);
      router.refresh();
    } catch (error) {
      console.error('Error deleting changelog:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete changelog'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main Content */}
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Content</CardTitle>
            <CardDescription>
              Write the changelog entry content using the rich text editor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Enter changelog title..."
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">/changelog/</span>
                <Input
                  id="slug"
                  placeholder="url-friendly-slug"
                  value={slug}
                  onChange={(e) => setSlug(generateSlug(e.target.value))}
                  disabled={isLoading}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Content</Label>
              <div className="rounded-lg border border-border">
                <RichTextEditor
                  content={content}
                  onChange={setContent}
                  onImageUpload={handleImageUpload}
                  writePlaceholder="Write your changelog content here..."
                  className="min-h-[400px] p-4"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPublished ? (
              <Badge
                variant="outline"
                className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green"
              >
                Published
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-muted bg-muted/50 text-muted-foreground"
              >
                Draft
              </Badge>
            )}

            {initialData?.published_at && (
              <p className="text-muted-foreground text-sm">
                Published on{' '}
                {new Date(initialData.published_at).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Metadata Card */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={category}
                onValueChange={setCategory}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      <div className="flex items-center gap-2">
                        {cat.icon}
                        <span>{cat.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="version">Version (optional)</Label>
              <Input
                id="version"
                placeholder="e.g., 1.2.3"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="summary">Summary (optional)</Label>
              <Textarea
                id="summary"
                placeholder="Brief summary for previews..."
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                disabled={isLoading}
                rows={3}
              />
            </div>

            <CoverImageUpload
              value={coverImageUrl}
              onChange={setCoverImageUrl}
              onUpload={handleImageUpload}
              disabled={isLoading}
            />
          </CardContent>
        </Card>

        {/* Actions Card */}
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full"
              onClick={() => handleSave(false)}
              disabled={isLoading}
            >
              {isLoading && !isPublishing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save as Draft'
              )}
            </Button>

            {!isPublished && (
              <Button
                className="w-full"
                variant="default"
                onClick={() => handleSave(true)}
                disabled={isLoading}
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  'Publish'
                )}
              </Button>
            )}

            {isPublished && (
              <Button
                className="w-full"
                variant="outline"
                onClick={handleUnpublish}
                disabled={isLoading}
              >
                Unpublish
              </Button>
            )}

            {isEditing && (
              <Button
                className="w-full"
                variant="destructive"
                onClick={handleDelete}
                disabled={isLoading}
              >
                Delete
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
