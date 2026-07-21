'use client';

import {
  BarChart3,
  Check,
  Copy,
  Eye,
  LayoutTemplate,
  Link,
  MoreHorizontal,
  Plus,
  Settings2,
  Table2,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';

import { FORM_FONT_VARIABLES } from '../fonts';
import { FormRuntime } from '../form-runtime';
import { FormsMarkdown } from '../forms-markdown';
import type {
  FormAnalytics,
  FormDefinition,
  FormResponseRecord,
  FormResponseSummary,
  FormResponsesQuestionAnalytics,
} from '../types';
import { AnalyticsPanel } from './analytics-panel';
import { FontPreviewPanel } from './font-preview-panel';
import { renderBuildTab } from './form-studio-build-tab';
import { useFormStudioSave } from './form-studio-save';
import { useFormStudioState } from './form-studio-state';
import { ResponsesPanel } from './responses-panel';
import { SettingsPanel } from './settings-panel';
import { ThemePickerPanel } from './theme-picker-panel';

export function FormStudio({
  wsId,
  workspaceSlug,
  mode,
  canManageForms = true,
  initialForm,
  initialResponses,
  initialResponsesTotal,
  initialResponsesSummary,
  initialResponsesPage = 1,
  initialResponsesPageSize = 10,
  initialQuestionAnalytics,
  initialAnalytics,
}: {
  wsId: string;
  workspaceSlug: string;
  mode: 'create' | 'edit';
  canManageForms?: boolean;
  initialForm?: FormDefinition;
  initialResponses?: FormResponseRecord[];
  initialResponsesTotal?: number;
  initialResponsesSummary?: FormResponseSummary;
  initialResponsesPage?: number;
  initialResponsesPageSize?: number;
  initialQuestionAnalytics?: FormResponsesQuestionAnalytics[];
  initialAnalytics?: FormAnalytics;
}) {
  const {
    t,
    tCommon,
    pathname,
    router,
    saveMutation,
    activeTab,
    setActiveTab,
    responsesPage,
    setResponsesPage,
    responsesPageSize,
    hasCopied,
    duplicatePending,
    autosaveEnabled,
    autosaveStatus,
    setAutosaveStatus,
    autosaveScheduledAt,
    setAutosaveScheduledAt,
    secondsUntilAutosave,
    setSecondsUntilAutosave,
    setActiveSectionId,
    activeQuestionIdsBySection,
    isFormDetailsOpen,
    setIsFormDetailsOpen,
    showFloatingSave,
    setShowFloatingSave,
    primarySaveButtonRef,
    form,
    values,
    isDirty,
    questionCount,
    displayTypographyClassName,
    bodyTypographyClassName,
    previewDefinition,
    sectionsArray,
    sectionSensors,
    studioToneClasses,
    studioBodyFontStyle,
    studioHeadlineFontStyle,
    studioPrimaryColorVar,
    studioSecondaryColorVar,
    studioLoopGradient,
    shareQuery,
    responsesQuery,
    analyticsQuery,
    responseSummary,
    resolvedActiveSectionId,
    responseTotal,
    scrollToSection,
    openSection,
    setActiveQuestionForSection,
    handleCopyLink,
    handleDuplicate,
    handleExport,
    handleImport,
    addSection,
    addBlockToActiveSection,
    handleTabChange,
  } = useFormStudioState({
    wsId,
    workspaceSlug,
    mode,
    initialForm,
    initialResponses,
    initialResponsesTotal,
    initialResponsesSummary,
    initialResponsesPage,
    initialResponsesPageSize,
    initialQuestionAnalytics,
    initialAnalytics,
  });

  const { handleSave, saveButtonDisabled, handleSectionDragEnd } =
    useFormStudioSave({
      t,
      form,
      mode,
      pathname,
      router,
      saveMutation,
      workspaceSlug,
      values,
      isDirty,
      sectionsArray,
      autosaveEnabled,
      autosaveStatus,
      setAutosaveStatus,
      autosaveScheduledAt,
      setAutosaveScheduledAt,
      setSecondsUntilAutosave,
      primarySaveButtonRef,
      setShowFloatingSave,
    });

  const SectionDivider = ({ onClick }: { onClick: () => void }) => (
    <div className="group relative flex items-center justify-center py-2">
      <div className="absolute inset-x-0 h-px bg-border/40 transition-colors group-hover:bg-border/60" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClick}
        className={cn(
          'relative h-8 gap-2 rounded-full border border-dashed bg-background px-4 opacity-40 transition-all hover:opacity-100',
          studioToneClasses.secondaryButtonClassName
        )}
      >
        <Plus className="h-4 w-4" />
        {t('studio.add_section')}
      </Button>
    </div>
  );
  return (
    <div
      className={cn(
        'relative isolate -m-2 min-h-screen min-w-0 overflow-x-clip bg-background [--form-studio-sticky-top:5rem] md:-m-4',
        FORM_FONT_VARIABLES
      )}
      style={studioBodyFontStyle}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div
          className="absolute inset-0 bg-repeat-y"
          style={{
            backgroundImage: studioLoopGradient,
            backgroundSize: '100% 200vh',
          }}
        />
        <div
          className="absolute inset-0 opacity-80"
          style={{
            backgroundImage: `
              radial-gradient(circle at top center, rgb(var(${studioPrimaryColorVar}) / 0.12), transparent 40%),
              radial-gradient(circle at center 58%, rgb(var(${studioSecondaryColorVar}) / 0.12), transparent 46%)
            `,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(180deg, hsl(var(--background) / 0.1) 0%, transparent 55%, hsl(var(--background) / 0.72) 100%)',
          }}
        />
      </div>
      <div className="relative z-10 mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-8 px-4 py-8">
        <Card
          className={cn(
            'overflow-hidden border-border/60 bg-card/85 shadow-black/5 shadow-xl',
            studioToneClasses.heroClassName
          )}
        >
          <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                  {t('brand')}
                </span>
                <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1 text-muted-foreground text-xs">
                  {mode === 'create'
                    ? t('studio.new_draft')
                    : t(`status.${values.status}`)}
                </span>
              </div>
              <div className="space-y-2">
                <h1
                  className={cn(
                    'max-w-4xl font-semibold tracking-tight',
                    displayTypographyClassName
                  )}
                  style={studioHeadlineFontStyle}
                >
                  {mode === 'create' ? (
                    t('studio.create_new_form')
                  ) : values.title ? (
                    <FormsMarkdown
                      content={values.title}
                      variant="inline"
                      className="[&_p]:m-0"
                    />
                  ) : (
                    t('studio.form_studio')
                  )}
                </h1>
                <p
                  className={cn(
                    'max-w-3xl text-muted-foreground',
                    bodyTypographyClassName
                  )}
                >
                  {t('studio.header_description')}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                    {t('tabs.build')}
                  </p>
                  <p className="mt-1 font-semibold text-lg">
                    {values.sections.length} {t('studio.sections_short')}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                    {t('studio.questions_short')}
                  </p>
                  <p className="mt-1 font-semibold text-lg">{questionCount}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                    {t('tabs.responses')}
                  </p>
                  <p className="mt-1 font-semibold text-lg">
                    {responseSummary.totalSubmissions}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {(mode === 'edit' && canManageForms) ||
              (mode === 'edit' && shareQuery?.shareLink?.code) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={cn(
                        'h-9 w-9 shrink-0 rounded-2xl',
                        studioToneClasses.secondaryButtonClassName
                      )}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {mode === 'edit' && canManageForms && (
                      <DropdownMenuItem
                        disabled={duplicatePending}
                        onClick={handleDuplicate}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {t('studio.duplicate_form')}
                      </DropdownMenuItem>
                    )}
                    {mode === 'edit' && shareQuery?.shareLink?.code && (
                      <DropdownMenuItem onClick={handleCopyLink}>
                        {hasCopied ? (
                          <Check className="mr-2 h-4 w-4 text-dynamic-green" />
                        ) : (
                          <Link className="mr-2 h-4 w-4" />
                        )}
                        {hasCopied ? tCommon('copied') : t('studio.copy_link')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <Button
                ref={primarySaveButtonRef}
                className={cn(
                  'rounded-2xl px-5',
                  studioToneClasses.primaryButtonClassName
                )}
                onClick={handleSave}
                disabled={saveButtonDisabled}
              >
                {saveMutation.isPending
                  ? t('studio.saving')
                  : autosaveStatus === 'error'
                    ? t('studio.autosave_failed')
                    : autosaveEnabled && isDirty && secondsUntilAutosave > 0
                      ? t('studio.autosave_in_seconds', {
                          seconds: secondsUntilAutosave,
                        })
                      : autosaveStatus === 'saved'
                        ? t('studio.autosave_saved')
                        : mode === 'create'
                          ? t('studio.create_form')
                          : t('studio.save_changes')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {showFloatingSave && (mode === 'create' || isDirty) ? (
          <div className="pointer-events-none fixed right-6 bottom-6 z-50">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saveButtonDisabled}
              className={cn(
                'pointer-events-auto rounded-2xl px-5 shadow-black/15 shadow-lg',
                studioToneClasses.primaryButtonClassName
              )}
            >
              {saveMutation.isPending
                ? t('studio.saving')
                : autosaveStatus === 'error'
                  ? t('studio.autosave_failed')
                  : autosaveEnabled && isDirty && secondsUntilAutosave > 0
                    ? t('studio.autosave_in_seconds', {
                        seconds: secondsUntilAutosave,
                      })
                    : autosaveStatus === 'saved'
                      ? t('studio.autosave_saved')
                      : mode === 'create'
                        ? t('studio.create_form')
                        : t('studio.save_changes')}
            </Button>
          </div>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="min-w-0 space-y-6"
        >
          <div className="sticky top-(--form-studio-sticky-top) z-40 -mx-1 min-w-0 bg-background/80 px-1 backdrop-blur supports-backdrop-filter:bg-background/85">
            <TabsList
              className={cn(
                'grid h-auto w-full max-w-full grid-cols-3 gap-1 rounded-2xl border border-border/60 p-1 shadow-sm sm:flex sm:items-center sm:justify-start sm:overflow-x-auto md:justify-center',
                studioToneClasses.tabListClassName
              )}
            >
              <TabsTrigger
                value="build"
                className={cn(
                  'min-w-0 px-2 text-xs sm:shrink-0 sm:px-3 sm:text-sm',
                  studioToneClasses.tabTriggerClassName
                )}
              >
                <LayoutTemplate className="hidden h-4 w-4 sm:block" />
                {t('tabs.build')}
              </TabsTrigger>
              <TabsTrigger
                value="preview"
                className={cn(
                  'min-w-0 px-2 text-xs sm:shrink-0 sm:px-3 sm:text-sm',
                  studioToneClasses.tabTriggerClassName
                )}
              >
                <Eye className="hidden h-4 w-4 sm:block" />
                {t('tabs.preview')}
              </TabsTrigger>
              <TabsTrigger
                value="responses"
                disabled={mode === 'create'}
                className={cn(
                  'min-w-0 px-2 text-xs sm:shrink-0 sm:px-3 sm:text-sm',
                  studioToneClasses.tabTriggerClassName
                )}
              >
                <Table2 className="hidden h-4 w-4 sm:block" />
                {t('tabs.responses')}
                <Badge
                  variant="outline"
                  className="ml-2 rounded-full px-2 py-0"
                >
                  {responseSummary.totalSubmissions}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="analytics"
                disabled={mode === 'create'}
                className={cn(
                  'min-w-0 px-2 text-xs sm:shrink-0 sm:px-3 sm:text-sm',
                  studioToneClasses.tabTriggerClassName
                )}
              >
                <BarChart3 className="hidden h-4 w-4 sm:block" />
                {t('tabs.analytics')}
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className={cn(
                  'min-w-0 px-2 text-xs sm:shrink-0 sm:px-3 sm:text-sm',
                  studioToneClasses.tabTriggerClassName
                )}
              >
                <Settings2 className="hidden h-4 w-4 sm:block" />
                {t('tabs.settings')}
              </TabsTrigger>
            </TabsList>
          </div>

          {renderBuildTab({
            wsId,
            t,
            form,
            values,
            studioToneClasses,
            sectionSensors,
            sectionsArray,
            isFormDetailsOpen,
            setIsFormDetailsOpen,
            resolvedActiveSectionId,
            activeQuestionIdsBySection,
            setActiveSectionId,
            setActiveQuestionForSection,
            openSection,
            scrollToSection,
            addSection,
            addBlockToActiveSection,
            handleSectionDragEnd,
            SectionDivider,
          })}

          <TabsContent value="preview" className="mt-0 min-w-0">
            <FormRuntime
              data-active="true"
              form={previewDefinition}
              mode="preview"
              className={cn(
                'rounded-xl border',
                studioToneClasses.tabTriggerClassName
              )}
            />
          </TabsContent>

          <TabsContent value="responses" className="mt-0 min-w-0">
            {initialForm ? (
              <ResponsesPanel
                wsId={wsId}
                formId={initialForm.id}
                responses={
                  responsesQuery.data?.records ?? initialResponses ?? []
                }
                total={responseTotal}
                summary={responseSummary}
                page={responsesPage}
                pageSize={responsesPageSize}
                onPageChange={(nextPage) => {
                  void setResponsesPage(nextPage);
                }}
                questionAnalytics={
                  responsesQuery.data?.questionAnalytics ??
                  initialQuestionAnalytics ??
                  []
                }
                onRefresh={() => responsesQuery.refetch()}
                isRefreshing={responsesQuery.isFetching}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="analytics" className="mt-0 min-w-0">
            {initialAnalytics ? (
              <AnalyticsPanel
                wsId={wsId}
                formId={initialForm?.id}
                analytics={analyticsQuery.data ?? initialAnalytics}
                onRefresh={() => analyticsQuery.refetch()}
                isRefreshing={analyticsQuery.isFetching}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="settings" className="mt-0 min-w-0 space-y-6">
            <ThemePickerPanel
              values={values}
              form={form}
              toneClasses={studioToneClasses}
            />
            <FontPreviewPanel
              values={values}
              form={form}
              toneClasses={studioToneClasses}
            />

            <SettingsPanel
              form={form}
              shareCode={shareQuery?.shareLink?.code}
              toneClasses={studioToneClasses}
              onOpenPreview={() => setActiveTab('preview')}
              onExport={handleExport}
              onImport={handleImport}
              isDirty={isDirty}
              responseSummary={responseSummary}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
