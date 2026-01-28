import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';

interface InvoiceContentEditorProps {
  type?: 'standard' | 'subscription';
  contentValue: string;
  notesValue: string;
  onContentChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  contentId?: string;
  notesId?: string;
}

export function InvoiceContentEditor({
  type = 'standard',
  contentValue,
  notesValue,
  onContentChange,
  onNotesChange,
  contentId = 'invoice-content',
  notesId = 'invoice-notes',
}: InvoiceContentEditorProps) {
  const t = useTranslations();

  const title =
    type === 'subscription'
      ? t('ws-invoices.subscription_invoice_configuration')
      : t('ws-invoices.invoice_configuration');

  const contentPlaceholder =
    type === 'subscription'
      ? t('ws-invoices.subscription_invoice_content_placeholder')
      : t('ws-invoices.content_placeholder');

  const notesPlaceholder =
    type === 'subscription'
      ? t('ws-invoices.additional_notes_placeholder')
      : t('ws-invoices.notes_placeholder');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={contentId}>{t('ws-invoices.content')}</Label>
          <Textarea
            id={contentId}
            placeholder={contentPlaceholder}
            className="min-h-20"
            value={contentValue}
            onChange={(e) => onContentChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={notesId}>{t('ws-invoices.notes')}</Label>
          <Textarea
            id={notesId}
            placeholder={notesPlaceholder}
            className="min-h-15"
            value={notesValue}
            onChange={(e) => onNotesChange(e.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
