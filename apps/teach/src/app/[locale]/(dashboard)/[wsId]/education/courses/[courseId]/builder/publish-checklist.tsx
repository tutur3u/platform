import { Copy, Trash2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { ModuleToggles } from '@tuturuuu/ui/custom/education/modules/module-toggle';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { useTranslations } from 'next-intl';
import type { useCourseBuilder } from './use-course-builder';

export function PublishChecklist({
  totalModules,
  modulesWithContent,
  activeModule,
  resolvedWsId,
  courseId,
  duplicateMutation,
  deleteModuleMutation,
}: Pick<
  ReturnType<typeof useCourseBuilder>,
  | 'totalModules'
  | 'modulesWithContent'
  | 'activeModule'
  | 'duplicateMutation'
  | 'deleteModuleMutation'
> & { resolvedWsId: string; courseId: string }) {
  const t = useTranslations();
  return (
    <EducationContentSurface className="h-fit lg:col-start-2" padded>
      <div className="space-y-4">
        <h2 className="font-semibold text-foreground/70 text-sm uppercase tracking-wide">
          {t('workspace-education-tabs.publish_checklist')}
        </h2>
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">{t('common.status')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{t('ws-course-modules.plural')}</span>
              <Badge variant={totalModules > 0 ? 'default' : 'secondary'}>
                {totalModules > 0
                  ? t('calendar-sidebar.ready')
                  : t('common.pending')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('course-details-tabs.module_content')}</span>
              <Badge
                variant={
                  totalModules > 0 && modulesWithContent === totalModules
                    ? 'default'
                    : 'secondary'
                }
              >
                {modulesWithContent}/{totalModules}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {activeModule && (
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">{activeModule.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ModuleToggles
                wsId={resolvedWsId}
                courseId={courseId}
                moduleId={activeModule.id}
                isPublished={activeModule.is_published}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={duplicateMutation.isPending}
                  onClick={() =>
                    duplicateMutation.mutate({
                      content: activeModule.content,
                      extra_content: activeModule.extra_content,
                      is_public: activeModule.is_public,
                      is_published: false,
                      module_group_id: activeModule.module_group_id,
                      name: `${activeModule.name} (Copy)`,
                      youtube_links: activeModule.youtube_links ?? [],
                    })
                  }
                >
                  <Copy className="h-4 w-4" />
                  {t('ws-task-boards.row_actions.duplicate')}
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-xl"
                  disabled={deleteModuleMutation.isPending}
                  onClick={() =>
                    deleteModuleMutation.mutate({
                      moduleGroupId: activeModule.module_group_id,
                      moduleId: activeModule.id,
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  {t('common.delete')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </EducationContentSurface>
  );
}
