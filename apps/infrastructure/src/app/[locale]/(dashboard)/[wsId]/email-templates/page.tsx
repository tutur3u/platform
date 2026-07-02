import { Mail } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import TemplatePreview from './template-preview';

export const metadata: Metadata = {
  title: 'Email Templates',
  description:
    'Preview and test all available email templates in the Infrastructure area of your Tuturuuu workspace.',
};

export default async function EmailTemplatesPage() {
  const t = await getTranslations('email-templates');

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-2xl">{t('title')}</h1>
            <p className="text-foreground/80">{t('description')}</p>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      <TemplatePreview />
    </>
  );
}
