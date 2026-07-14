import type { UseMutationResult } from '@tanstack/react-query';
import { BarChart3, Upload } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { useTranslations } from 'next-intl';

type Translate = ReturnType<typeof useTranslations>;

export function ImportPanel({
  importMutation,
  importPreviewCount,
  importText,
  setImportText,
  t,
}: {
  importMutation: UseMutationResult<any, unknown, boolean>;
  importPreviewCount: number;
  importText: string;
  setImportText: (value: string) => void;
  t: Translate;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('import.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          className="min-h-56 font-mono text-sm"
          onChange={(event) => setImportText(event.target.value)}
          placeholder={t('import.placeholder')}
          value={importText}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-muted-foreground text-sm">
            {t('import.preview_count', { count: importPreviewCount })}
          </div>
          <div className="flex gap-2">
            <Button
              disabled={!importText.trim() || importMutation.isPending}
              onClick={() => importMutation.mutate(false)}
              variant="outline"
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              {t('actions.preview')}
            </Button>
            <Button
              disabled={!importText.trim() || importMutation.isPending}
              onClick={() => importMutation.mutate(true)}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t('actions.commit_import')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
