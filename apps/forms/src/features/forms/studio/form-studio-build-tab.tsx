'use client';

import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ChevronDown, Plus } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Label } from '@tuturuuu/ui/label';
import { TabsContent } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType } from 'react';

import { FormsMarkdown } from '../forms-markdown';
import { FormsRichTextEditor } from '../forms-rich-text-editor';
import { FloatingBlockToolbar } from './floating-block-toolbar';
import { FormMediaField } from './form-media-field';
import type { FormStudioState } from './form-studio-state';
import { LogicRulesEditor } from './logic-rules-editor';
import { SectionEditor } from './section-editor';
import { duplicateSectionInput } from './studio-utils';

export function renderBuildTab({
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
}: {
  wsId: string;
  t: FormStudioState['t'];
  form: FormStudioState['form'];
  values: FormStudioState['values'];
  studioToneClasses: FormStudioState['studioToneClasses'];
  sectionSensors: FormStudioState['sectionSensors'];
  sectionsArray: FormStudioState['sectionsArray'];
  isFormDetailsOpen: FormStudioState['isFormDetailsOpen'];
  setIsFormDetailsOpen: FormStudioState['setIsFormDetailsOpen'];
  resolvedActiveSectionId: FormStudioState['resolvedActiveSectionId'];
  activeQuestionIdsBySection: FormStudioState['activeQuestionIdsBySection'];
  setActiveSectionId: FormStudioState['setActiveSectionId'];
  setActiveQuestionForSection: FormStudioState['setActiveQuestionForSection'];
  openSection: FormStudioState['openSection'];
  scrollToSection: FormStudioState['scrollToSection'];
  addSection: FormStudioState['addSection'];
  addBlockToActiveSection: FormStudioState['addBlockToActiveSection'];
  handleSectionDragEnd: (event: DragEndEvent) => void;
  SectionDivider: ComponentType<{ onClick: () => void }>;
}) {
  return (
    <TabsContent value="build" className="mt-0 min-w-0">
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-1 xl:grid-cols-[72px_minmax(0,1fr)]">
        <FloatingBlockToolbar
          toneClasses={studioToneClasses}
          onAddSection={() => addSection()}
          onAddBlock={addBlockToActiveSection}
        />
        <div className="min-w-0 space-y-6">
          <Collapsible
            open={isFormDetailsOpen}
            onOpenChange={setIsFormDetailsOpen}
          >
            <Card className="border-border/60 bg-card/80 shadow-sm">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start whitespace-normal rounded-3xl px-5 py-4 hover:bg-transparent"
                >
                  <div className="flex w-full items-start gap-4 text-left">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-base">
                          {t('studio.form_details')}
                        </p>
                        <Badge
                          variant="outline"
                          className="rounded-full px-2 py-0.5 text-[11px]"
                        >
                          {values.theme.coverImage.url ||
                          values.theme.coverImage.storagePath
                            ? t('studio.cover_set')
                            : t('studio.cover_not_set')}
                        </Badge>
                      </div>
                      <div className="line-clamp-2 text-muted-foreground text-sm">
                        <FormsMarkdown
                          content={
                            values.description?.trim() ||
                            t('studio.first_impression_hint')
                          }
                          variant="inline"
                          className="line-clamp-2"
                        />
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        'mt-1 h-4 w-4 shrink-0 transition-transform',
                        isFormDetailsOpen && 'rotate-180'
                      )}
                    />
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="border-border/60 border-t data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <CardContent className="space-y-4 p-5">
                  <div className="space-y-2">
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
                      {t('studio.first_impression')}
                    </p>
                    <p className="max-w-2xl text-muted-foreground text-sm">
                      {t('studio.first_impression_hint')}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('studio.form_title')}</Label>
                    <FormsRichTextEditor
                      value={values.title}
                      onChange={(nextValue) =>
                        form.setValue('title', nextValue, {
                          shouldDirty: true,
                        })
                      }
                      placeholder={t('studio.form_title_placeholder')}
                      toneClasses={studioToneClasses}
                      compact
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('studio.description')}</Label>
                    <FormsRichTextEditor
                      value={values.description}
                      onChange={(nextValue) =>
                        form.setValue('description', nextValue, {
                          shouldDirty: true,
                        })
                      }
                      placeholder={t('studio.form_description_placeholder')}
                      toneClasses={studioToneClasses}
                    />
                  </div>
                  <FormMediaField
                    wsId={wsId}
                    scope="cover"
                    value={values.theme.coverImage}
                    onChange={(value) =>
                      form.setValue('theme.coverImage', value, {
                        shouldDirty: true,
                      })
                    }
                    toneClasses={studioToneClasses}
                    label={t('studio.cover_image')}
                    hint={t('studio.cover_image_hint')}
                  />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <DndContext
            sensors={sectionSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSectionDragEnd}
          >
            <div className="space-y-4">
              {sectionsArray.fields.length > 0 && (
                <SectionDivider onClick={() => addSection(0)} />
              )}

              <SortableContext
                items={sectionsArray.fields.map(
                  (field, sectionIndex) =>
                    values.sections[sectionIndex]?.id ?? field.id
                )}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {sectionsArray.fields.map((field, sectionIndex) => {
                    const sectionFormId =
                      values.sections[sectionIndex]?.id ?? field.id;

                    return (
                      <div key={field.id} className="space-y-4">
                        <SectionEditor
                          index={sectionIndex}
                          wsId={wsId}
                          sectionId={sectionFormId}
                          form={form}
                          open={resolvedActiveSectionId === sectionFormId}
                          onOpenChange={(nextOpen) => {
                            if (nextOpen) {
                              openSection(sectionFormId);
                              return;
                            }

                            if (resolvedActiveSectionId === sectionFormId) {
                              setActiveSectionId('');
                            }
                          }}
                          activeQuestionId={
                            activeQuestionIdsBySection[sectionFormId]
                          }
                          onActiveQuestionChange={(questionId) =>
                            setActiveQuestionForSection(
                              sectionFormId,
                              questionId
                            )
                          }
                          onDuplicate={() => {
                            const section = form.getValues(
                              `sections.${sectionIndex}`
                            );

                            if (!section) {
                              return;
                            }

                            const nextSection = duplicateSectionInput(section);
                            sectionsArray.insert(sectionIndex + 1, nextSection);
                            openSection(nextSection.id);
                            scrollToSection(nextSection.id);
                          }}
                          toneClasses={studioToneClasses}
                          onRemove={() => {
                            sectionsArray.remove(sectionIndex);
                            if (resolvedActiveSectionId === sectionFormId) {
                              setActiveSectionId('');
                            }
                          }}
                          onMoveUp={() =>
                            sectionIndex > 0 &&
                            sectionsArray.move(sectionIndex, sectionIndex - 1)
                          }
                          onMoveDown={() =>
                            sectionIndex < sectionsArray.fields.length - 1 &&
                            sectionsArray.move(sectionIndex, sectionIndex + 1)
                          }
                        />
                        <SectionDivider
                          onClick={() => addSection(sectionIndex + 1)}
                        />
                      </div>
                    );
                  })}
                </div>
              </SortableContext>

              {sectionsArray.fields.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-border/60 border-dashed bg-background/40 py-12">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-10 gap-2 rounded-full border-border/60 px-6',
                      studioToneClasses.secondaryButtonClassName
                    )}
                    onClick={() => addSection()}
                  >
                    <Plus className="h-4 w-4" />
                    {t('studio.add_section')}
                  </Button>
                </div>
              )}
            </div>
          </DndContext>

          <LogicRulesEditor form={form} toneClasses={studioToneClasses} />
        </div>
      </div>
    </TabsContent>
  );
}
