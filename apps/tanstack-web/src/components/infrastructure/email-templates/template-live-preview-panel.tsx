'use client';

import { Copy, Moon, Sun } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { EmailHtmlViewer } from './email-html-viewer';

type TemplateLivePreviewPanelProps = {
  html: string;
  isDarkMode: boolean;
  isError: boolean;
  onCopyHtml: () => void;
  onToggleTheme: () => void;
};

export function TemplateLivePreviewPanel({
  html,
  isDarkMode,
  isError,
  onCopyHtml,
  onToggleTheme,
}: TemplateLivePreviewPanelProps) {
  const t = useTranslations('email-templates');

  return (
    <Card className="flex flex-col p-0">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg">{t('live_preview')}</CardTitle>
        <div className="flex items-center gap-2">
          <Button onClick={onToggleTheme} size="sm" variant="outline">
            {isDarkMode ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">
              {isDarkMode ? t('light_mode') : t('dark_mode')}
            </span>
          </Button>
          <Button
            disabled={!html}
            onClick={onCopyHtml}
            size="sm"
            variant="outline"
          >
            <Copy className="h-4 w-4" />
            <span className="ml-2 hidden sm:inline">{t('copy_html')}</span>
          </Button>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="flex flex-1 flex-col p-0">
        {isError ? (
          <div className="flex min-h-125 w-full flex-1 items-center justify-center rounded-b-lg p-6 text-center text-destructive text-sm">
            {t('render_failed')}
          </div>
        ) : html ? (
          <>
            <EmailHtmlViewer
              className={`min-h-125 w-full flex-1 border-0 ${
                isDarkMode ? '' : 'rounded-b-lg'
              }`}
              content={html}
              previewTheme={isDarkMode ? 'dark' : 'light'}
            />
            {isDarkMode && (
              <div className="rounded-b-lg border-t bg-muted/50 p-2 text-center text-muted-foreground text-xs">
                {t('dark_mode_warning')}
              </div>
            )}
          </>
        ) : (
          <div className="flex min-h-125 w-full flex-1 items-center justify-center rounded-b-lg text-muted-foreground text-sm">
            {t('loading_preview')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
