import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { ReactNode } from 'react';

interface InvoiceContentEditorProps {
  title: ReactNode;
  contentLabel: string;
  contentPlaceholder: string;
  contentValue: string;
  notesLabel: string;
  notesPlaceholder: string;
  notesValue: string;
  onContentChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  contentId?: string;
  notesId?: string;
}

export function InvoiceContentEditor({
  title,
  contentLabel,
  contentPlaceholder,
  contentValue,
  notesLabel,
  notesPlaceholder,
  notesValue,
  onContentChange,
  onNotesChange,
  contentId = 'invoice-content',
  notesId = 'invoice-notes',
}: InvoiceContentEditorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={contentId}>{contentLabel}</Label>
          <Textarea
            id={contentId}
            placeholder={contentPlaceholder}
            className="min-h-20"
            value={contentValue}
            onChange={(e) => onContentChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={notesId}>{notesLabel}</Label>
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
