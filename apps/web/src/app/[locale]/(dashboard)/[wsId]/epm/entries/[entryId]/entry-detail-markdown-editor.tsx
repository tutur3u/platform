'use client';

import { Label } from '@tuturuuu/ui/label';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import remarkGfm from 'remark-gfm';

export function EntryDetailMarkdownEditor({
  description,
  id,
  label,
  onChange,
  placeholder,
  previewLabel,
  previewPlaceholder,
  rows = 8,
  value,
  writeLabel,
}: {
  description?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  previewLabel: string;
  previewPlaceholder: string;
  rows?: number;
  value: string;
  writeLabel: string;
}) {
  const trimmedValue = value.trim();

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        {description ? (
          <p className="text-muted-foreground text-sm leading-6">
            {description}
          </p>
        ) : null}
      </div>

      <Tabs defaultValue="write" className="space-y-3">
        <TabsList className="grid w-fit grid-cols-2">
          <TabsTrigger value="write">{writeLabel}</TabsTrigger>
          <TabsTrigger value="preview">{previewLabel}</TabsTrigger>
        </TabsList>

        <TabsContent value="write">
          <Textarea
            id={id}
            rows={rows}
            className="min-h-[220px] resize-y"
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </TabsContent>

        <TabsContent value="preview">
          <div className="min-h-[220px] rounded-xl border border-border/70 bg-background/70 p-4">
            {trimmedValue ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MemoizedReactMarkdown remarkPlugins={[remarkGfm]}>
                  {trimmedValue}
                </MemoizedReactMarkdown>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm leading-6">
                {previewPlaceholder}
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
