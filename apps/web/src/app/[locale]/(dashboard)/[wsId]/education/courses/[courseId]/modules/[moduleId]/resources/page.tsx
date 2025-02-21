import DeleteResourceButton from './delete-resource';
import FileDisplay from './file-display';
import { StorageObjectForm } from '@/app/[locale]/(dashboard)/[wsId]/drive/form';
import { createDynamicClient } from '@tutur3u/supabase/next/server';
import FeatureSummary from '@tutur3u/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/separator';
import { Paperclip } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function ModuleResourcesPage({ params }: Props) {
  const t = await getTranslations();

  const { wsId, courseId, moduleId } = await params;
  const storagePath = `${wsId}/courses/${courseId}/modules/${moduleId}/resources/`;
  const resources = await getResources({ path: storagePath });

  return (
    <div className="grid gap-4">
      <FeatureSummary
        title={
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex w-full items-center gap-2 text-lg font-bold md:text-2xl">
              <Paperclip className="h-5 w-5" />
              {t('course-details-tabs.resources')}
            </h1>
          </div>
        }
        singularTitle={t('ws-course-modules.resource')}
        pluralTitle={t('ws-course-modules.resources')}
        createTitle={t('ws-course-modules.add_resource')}
        createDescription={t('ws-course-modules.add_resource_description')}
        form={
          <StorageObjectForm
            wsId={wsId}
            submitLabel={t('common.upload')}
            path={storagePath}
            accept="*"
          />
        }
      />
      {resources &&
        resources.length > 0 &&
        resources.map((file) => (
          <div
            key={file.name}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 p-2 md:p-4"
          >
            <DeleteResourceButton path={`${storagePath}${file.name}`} />
            <div className="font-semibold hover:underline">
              {file.name
                // remove leading UUID_ from file name
                .replace(
                  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_/,
                  ''
                )}
            </div>
            <Separator className="my-2" />
            <div className="w-full">
              <FileDisplay path={storagePath} file={file} />
            </div>
          </div>
        ))}
    </div>
  );
}

async function getResources({ path }: { path: string }) {
  const supabase = await createDynamicClient();

  const { data, error } = await supabase.storage.from('workspaces').list(path, {
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error) throw error;

  return data;
}
