'use client';

import { ZoomIn } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import type { useTranslations } from 'next-intl';
import { normalizeMarkdownToText } from '../content';
import { FormsMarkdown } from '../forms-markdown';
import type { FormDefinitionQuestion } from '../types';

export function renderStaticQuestionBlock({
  question,
  settings,
  t,
  headingClassName,
  bodyClassName,
  onImagePreview,
}: {
  question: FormDefinitionQuestion;
  settings: NonNullable<FormDefinitionQuestion['settings']>;
  t: ReturnType<typeof useTranslations<'forms'>>;
  headingClassName: string;
  bodyClassName: string;
  onImagePreview: (image: { src: string; alt: string }) => void;
}) {
  if (question.type === 'section_break') {
    return (
      <div className="py-2">
        <Separator className="bg-border/60" />
      </div>
    );
  }

  if (question.type === 'divider') {
    return (
      <div className="py-3">
        <Separator className="bg-border/60" />
      </div>
    );
  }

  if (question.type === 'rich_text') {
    return (
      <div className="space-y-3 rounded-[1.6rem] border border-border/60 bg-background/45 p-5 sm:p-6">
        {question.title ? (
          <div className={cn('font-semibold leading-tight', headingClassName)}>
            <FormsMarkdown content={question.title} className="[&_p]:m-0" />
          </div>
        ) : null}
        {question.description ? (
          <FormsMarkdown
            content={question.description}
            className={cn('text-muted-foreground', bodyClassName)}
          />
        ) : null}
      </div>
    );
  }

  if (question.type === 'image') {
    return (
      <div className="space-y-4 rounded-[1.6rem] border border-border/60 bg-background/45 p-5 sm:p-6">
        {question.title ? (
          <div className={cn('font-semibold leading-tight', headingClassName)}>
            <FormsMarkdown content={question.title} className="[&_p]:m-0" />
          </div>
        ) : null}
        {question.image?.url ? (
          <div className="relative aspect-video overflow-hidden rounded-[1.35rem] border border-border/60 bg-background/70">
            <Image
              src={question.image.url}
              alt={
                question.image.alt ||
                normalizeMarkdownToText(question.title) ||
                t('studio.question_image')
              }
              fill
              unoptimized
              className="object-cover"
            />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-background/85 shadow-sm backdrop-blur-sm"
              onClick={() =>
                onImagePreview({
                  src: question.image.url,
                  alt:
                    question.image.alt ||
                    normalizeMarkdownToText(question.title) ||
                    t('studio.question_image'),
                })
              }
            >
              <ZoomIn className="h-4 w-4" />
              <span className="sr-only">
                {t('runtime.view_image_fullscreen')}
              </span>
            </Button>
          </div>
        ) : null}
        {question.description ? (
          <FormsMarkdown
            content={question.description}
            className={cn('text-muted-foreground', bodyClassName)}
          />
        ) : null}
      </div>
    );
  }

  if (question.type === 'youtube') {
    const videoId = settings.youtubeVideoId;
    const startSeconds = settings.youtubeStartSeconds ?? 0;
    const embedUrl = videoId
      ? `https://www.youtube.com/embed/${videoId}${startSeconds > 0 ? `?start=${startSeconds}` : ''}`
      : '';

    return (
      <div className="space-y-4 rounded-[1.6rem] border border-border/60 bg-background/45 p-5 sm:p-6">
        {question.title ? (
          <div className={cn('font-semibold leading-tight', headingClassName)}>
            <FormsMarkdown content={question.title} className="[&_p]:m-0" />
          </div>
        ) : null}
        {embedUrl ? (
          <div className="overflow-hidden rounded-[1.35rem] border border-border/60 bg-background/70 shadow-sm">
            <div className="aspect-video">
              <iframe
                src={embedUrl}
                title={normalizeMarkdownToText(question.title) || 'YouTube'}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        ) : null}
        {question.description ? (
          <FormsMarkdown
            content={question.description}
            className={cn('text-muted-foreground', bodyClassName)}
          />
        ) : null}
      </div>
    );
  }

  return null;
}
