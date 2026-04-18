'use client';

import {
  Download,
  Expand,
  GripVertical,
  Megaphone,
  Monitor,
  Moon,
  RotateCcw,
  Smartphone,
  Sun,
  Tablet,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { type ComponentType, type ReactNode, useId, useState } from 'react';
import { FacebookMockupImageUploadField } from './image-upload-field';
import type {
  FacebookMockupReactionVariant,
  FacebookMockupState,
  TranslationFn,
} from './types';

interface FacebookMockupFormProps {
  state: FacebookMockupState;
  error: string | null;
  canReset: boolean;
  t: TranslationFn;
  previewTheme: 'dark' | 'light';
  previewViewport: 'phone' | 'tablet' | 'desktop';
  onPreviewThemeChange: (theme: 'dark' | 'light') => void;
  onPreviewViewportChange: (viewport: 'phone' | 'tablet' | 'desktop') => void;
  onValueChange: <Key extends keyof FacebookMockupState>(
    key: Key,
    value: FacebookMockupState[Key]
  ) => void;
  onAvatarChange: (file: File | null) => void;
  onCreativeChange: (file: File | null) => void;
  onReset: () => void;
  onDownload: () => void;
  onOpenFullscreen: () => void;
}

function ToolbarIconButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          className={cn(
            'size-9 rounded-lg border border-transparent',
            active
              ? 'border-dynamic-blue/20 bg-background text-dynamic-blue shadow-sm hover:bg-background'
              : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
          )}
          onClick={onClick}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-background/75 p-1">
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: 'text' | 'number';
}) {
  const inputId = useId();

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        type={type}
        min={type === 'number' ? 0 : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows: number;
}) {
  const inputId = useId();

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Textarea
        id={inputId}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ReactionVisibilityToggle({
  reaction,
  label,
  checked,
  dragLabel,
  moveUpLabel,
  moveDownLabel,
  canMoveUp,
  canMoveDown,
  onCheckedChange,
  isDragging,
  isDropTarget,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: {
  reaction: FacebookMockupReactionVariant;
  label: string;
  checked: boolean;
  dragLabel: string;
  moveUpLabel: string;
  moveDownLabel: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onCheckedChange: (value: boolean) => void;
  isDragging: boolean;
  isDropTarget: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (reaction: FacebookMockupReactionVariant) => void;
  onDragEnter: (reaction: FacebookMockupReactionVariant) => void;
  onDragEnd: () => void;
  onDrop: (reaction: FacebookMockupReactionVariant) => void;
}) {
  const inputId = useId();

  return (
    <div
      draggable
      onDragStart={() => onDragStart(reaction)}
      onDragEnter={() => onDragEnter(reaction)}
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={() => onDrop(reaction)}
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-background px-3 py-2 transition-all',
        isDragging && 'opacity-55',
        isDropTarget
          ? 'border-dynamic-blue/40 shadow-[0_0_0_1px_rgba(59,130,246,0.24)]'
          : 'border-black/5'
      )}
    >
      <button
        type="button"
        className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground active:cursor-grabbing"
        aria-label={dragLabel}
      >
        <GripVertical className="size-4" />
      </button>
      <span
        className="inline-flex size-6 shrink-0 overflow-hidden rounded-full"
        aria-hidden="true"
      >
        {/* biome-ignore lint/performance/noImgElement: public reaction assets are intentionally rendered as images */}
        <img
          src={`/media/facebook-reactions/${reaction}.png`}
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
      <label
        htmlFor={inputId}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <Checkbox
          id={inputId}
          checked={checked}
          onCheckedChange={(nextState) => onCheckedChange(Boolean(nextState))}
        />
        <span className="truncate text-sm">{label}</span>
      </label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={moveUpLabel}
          className="size-8 rounded-lg"
          disabled={!canMoveUp}
          onClick={onMoveUp}
        >
          <span aria-hidden="true" className="text-base leading-none">
            ↑
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={moveDownLabel}
          className="size-8 rounded-lg"
          disabled={!canMoveDown}
          onClick={onMoveDown}
        >
          <span aria-hidden="true" className="text-base leading-none">
            ↓
          </span>
        </Button>
      </div>
    </div>
  );
}

const createReactionLabel = (
  t: TranslationFn,
  reaction: FacebookMockupReactionVariant
) => t(`facebook_mockup.reactions.${reaction}`);

export function FacebookMockupForm({
  state,
  error,
  canReset,
  t,
  previewTheme,
  previewViewport,
  onPreviewThemeChange,
  onPreviewViewportChange,
  onValueChange,
  onAvatarChange,
  onCreativeChange,
  onReset,
  onDownload,
  onOpenFullscreen,
}: FacebookMockupFormProps) {
  const [draggedReaction, setDraggedReaction] =
    useState<FacebookMockupReactionVariant | null>(null);
  const [dropTargetReaction, setDropTargetReaction] =
    useState<FacebookMockupReactionVariant | null>(null);
  const reorderReaction = (
    order: FacebookMockupReactionVariant[],
    reaction: FacebookMockupReactionVariant,
    targetIndex: number
  ) => {
    const currentIndex = order.indexOf(reaction);

    if (
      currentIndex === -1 ||
      targetIndex < 0 ||
      targetIndex >= order.length ||
      currentIndex === targetIndex
    ) {
      return order;
    }

    const nextOrder = [...order];
    nextOrder.splice(currentIndex, 1);
    nextOrder.splice(targetIndex, 0, reaction);
    return nextOrder;
  };

  return (
    <div className="grid gap-4">
      <Card className="border-dynamic-blue/15 bg-linear-to-br from-dynamic-blue/10 via-background to-dynamic-cyan/10">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{t('facebook_mockup.title')}</CardTitle>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('facebook_mockup.description')}
              </p>
            </div>
          </div>

          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex min-w-max items-center gap-2">
              <ToolbarGroup>
                <ToolbarIconButton
                  icon={Download}
                  label={t('common.download')}
                  onClick={onDownload}
                />
                <ToolbarIconButton
                  icon={Expand}
                  label={t('facebook_mockup.fullscreen.open')}
                  onClick={onOpenFullscreen}
                />
                <ToolbarIconButton
                  icon={RotateCcw}
                  label={t('common.reset')}
                  disabled={!canReset}
                  onClick={onReset}
                />
              </ToolbarGroup>

              <ToolbarGroup>
                <ToolbarIconButton
                  icon={Megaphone}
                  label={t('facebook_mockup.modes.ad')}
                  active={state.mode === 'ad'}
                  onClick={() => onValueChange('mode', 'ad')}
                />
                <ToolbarIconButton
                  icon={Monitor}
                  label={t('facebook_mockup.modes.page')}
                  active={state.mode === 'page'}
                  onClick={() => onValueChange('mode', 'page')}
                />
              </ToolbarGroup>

              <ToolbarGroup>
                <ToolbarIconButton
                  icon={Moon}
                  label={t('facebook_mockup.preview_themes.dark')}
                  active={previewTheme === 'dark'}
                  onClick={() => onPreviewThemeChange('dark')}
                />
                <ToolbarIconButton
                  icon={Sun}
                  label={t('facebook_mockup.preview_themes.light')}
                  active={previewTheme === 'light'}
                  onClick={() => onPreviewThemeChange('light')}
                />
              </ToolbarGroup>

              <ToolbarGroup>
                <ToolbarIconButton
                  icon={Smartphone}
                  label={t('facebook_mockup.viewport_modes.phone')}
                  active={previewViewport === 'phone'}
                  onClick={() => onPreviewViewportChange('phone')}
                />
                <ToolbarIconButton
                  icon={Tablet}
                  label={t('facebook_mockup.viewport_modes.tablet')}
                  active={previewViewport === 'tablet'}
                  onClick={() => onPreviewViewportChange('tablet')}
                />
                <ToolbarIconButton
                  icon={Monitor}
                  label={t('facebook_mockup.viewport_modes.desktop')}
                  active={previewViewport === 'desktop'}
                  onClick={() => onPreviewViewportChange('desktop')}
                />
              </ToolbarGroup>
            </div>
          </div>
        </CardHeader>
      </Card>

      {error ? (
        <div className="rounded-2xl border border-dynamic-red/20 bg-dynamic-red/10 px-4 py-3 text-dynamic-red text-sm">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('facebook_mockup.sections.identity')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <TextField
            label={t('facebook_mockup.fields.page_name')}
            value={state.pageName}
            placeholder={t('facebook_mockup.placeholders.page_name')}
            onChange={(value) => onValueChange('pageName', value)}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label={t('facebook_mockup.fields.page_handle')}
              value={state.pageHandle}
              placeholder={t('facebook_mockup.placeholders.page_handle')}
              onChange={(value) => onValueChange('pageHandle', value)}
            />
            <TextField
              label={t('facebook_mockup.fields.audience_label')}
              value={state.audienceLabel}
              placeholder={t('facebook_mockup.placeholders.audience_label')}
              onChange={(value) => onValueChange('audienceLabel', value)}
            />
          </div>
          {state.mode === 'ad' ? (
            <TextField
              label={t('facebook_mockup.fields.sponsored_label')}
              value={state.sponsoredLabel}
              placeholder={t('facebook_mockup.placeholders.sponsored_label')}
              onChange={(value) => onValueChange('sponsoredLabel', value)}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('facebook_mockup.sections.media')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <FacebookMockupImageUploadField
            label={t('facebook_mockup.fields.avatar_image')}
            helperText={t('facebook_mockup.helper_text.upload_image', {
              size: '8MB',
            })}
            imageUrl={state.avatarImageUrl}
            fileName={state.avatarFileName}
            previewAlt={t('facebook_mockup.preview.avatar_alt')}
            onFileChange={onAvatarChange}
          />
          <FacebookMockupImageUploadField
            label={t('facebook_mockup.fields.creative_image')}
            helperText={t('facebook_mockup.helper_text.upload_image', {
              size: '8MB',
            })}
            imageUrl={state.creativeImageUrl}
            fileName={state.creativeFileName}
            previewAlt={t('facebook_mockup.preview.creative_alt')}
            onFileChange={onCreativeChange}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('facebook_mockup.sections.content')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <TextAreaField
            label={t('facebook_mockup.fields.caption')}
            value={state.caption}
            placeholder={t('facebook_mockup.placeholders.caption')}
            rows={4}
            onChange={(value) => onValueChange('caption', value)}
          />
          <TextField
            label={t('facebook_mockup.fields.cta_label')}
            value={state.ctaLabel}
            placeholder={t('facebook_mockup.placeholders.cta_label')}
            onChange={(value) => onValueChange('ctaLabel', value)}
          />
          {state.mode === 'ad' ? (
            <>
              <TextField
                label={t('facebook_mockup.fields.headline')}
                value={state.headline}
                placeholder={t('facebook_mockup.placeholders.headline')}
                onChange={(value) => onValueChange('headline', value)}
              />
              <TextAreaField
                label={t('facebook_mockup.fields.description')}
                value={state.description}
                placeholder={t('facebook_mockup.placeholders.description')}
                rows={3}
                onChange={(value) => onValueChange('description', value)}
              />
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('facebook_mockup.sections.performance')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <TextField
            type="number"
            label={t('facebook_mockup.fields.reactions')}
            value={state.reactions}
            placeholder={t('facebook_mockup.placeholders.metric_value')}
            onChange={(value) => onValueChange('reactions', value)}
          />
          <TextField
            type="number"
            label={t('facebook_mockup.fields.comments')}
            value={state.comments}
            placeholder={t('facebook_mockup.placeholders.metric_value')}
            onChange={(value) => onValueChange('comments', value)}
          />
          <TextField
            type="number"
            label={t('facebook_mockup.fields.shares')}
            value={state.shares}
            placeholder={t('facebook_mockup.placeholders.metric_value')}
            onChange={(value) => onValueChange('shares', value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('facebook_mockup.sections.reactions')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {state.reactionOrder.map((reaction, index) => {
            const reactionLabel = createReactionLabel(t, reaction);

            return (
              <ReactionVisibilityToggle
                key={reaction}
                reaction={reaction}
                label={reactionLabel}
                checked={state.enabledReactions[reaction]}
                dragLabel={t('facebook_mockup.actions.drag_to_reorder', {
                  reaction: reactionLabel,
                })}
                moveUpLabel={t('facebook_mockup.actions.move_up', {
                  reaction: reactionLabel,
                })}
                moveDownLabel={t('facebook_mockup.actions.move_down', {
                  reaction: reactionLabel,
                })}
                canMoveUp={index > 0}
                canMoveDown={index < state.reactionOrder.length - 1}
                isDragging={draggedReaction === reaction}
                isDropTarget={
                  dropTargetReaction === reaction &&
                  draggedReaction !== reaction
                }
                onCheckedChange={(nextState) => {
                  onValueChange('enabledReactions', {
                    ...state.enabledReactions,
                    [reaction]: nextState,
                  });
                }}
                onMoveUp={() => {
                  onValueChange(
                    'reactionOrder',
                    reorderReaction(state.reactionOrder, reaction, index - 1)
                  );
                }}
                onMoveDown={() => {
                  onValueChange(
                    'reactionOrder',
                    reorderReaction(state.reactionOrder, reaction, index + 1)
                  );
                }}
                onDragStart={(nextReaction) => {
                  setDraggedReaction(nextReaction);
                  setDropTargetReaction(nextReaction);
                }}
                onDragEnter={(nextReaction) => {
                  setDropTargetReaction(nextReaction);
                }}
                onDragEnd={() => {
                  setDraggedReaction(null);
                  setDropTargetReaction(null);
                }}
                onDrop={(targetReaction) => {
                  if (!draggedReaction || draggedReaction === targetReaction) {
                    setDraggedReaction(null);
                    setDropTargetReaction(null);
                    return;
                  }

                  const targetIndex =
                    state.reactionOrder.indexOf(targetReaction);
                  onValueChange(
                    'reactionOrder',
                    reorderReaction(
                      state.reactionOrder,
                      draggedReaction,
                      targetIndex
                    )
                  );
                  setDraggedReaction(null);
                  setDropTargetReaction(null);
                }}
              />
            );
          })}
          <p className="text-muted-foreground text-xs">
            {t('facebook_mockup.helper_text.drag_reactions')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
