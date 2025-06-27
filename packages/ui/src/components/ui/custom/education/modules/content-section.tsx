import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

interface RawContentNode {
  type: string;
  content?: Array<{
    type: string;
    text?: string;
  }>;
}

interface RawContent {
  content?: RawContentNode[];
}

export async function CourseSection({
  href,
  title,
  icon,
  rawContent,
  content,
  hideContent,
}: {
  href?: string;
  title: string;
  icon: ReactNode;
  rawContent?: RawContent;
  content?: ReactNode;
  hideContent?: boolean;
}) {
  const t = await getTranslations();

  const isContentEmpty =
    !hideContent &&
    (rawContent
      ? !rawContent.content?.some(
          (node: RawContentNode) =>
            node.type !== 'paragraph' ||
            (node.content && node.content.length > 0)
        )
      : !content);

  return (
    <AccordionItem
      value={title}
      className="rounded-lg border border-foreground/10 bg-foreground/5 px-4"
    >
      <AccordionTrigger className="items-center">
        {href ? (
          <Link
            href={href}
            className="flex w-fit items-center gap-2 text-lg font-semibold hover:underline md:text-2xl"
          >
            {icon}
            {title}
          </Link>
        ) : (
          <div className="flex items-center gap-2 text-lg font-semibold md:text-2xl">
            {icon}
            {title}
          </div>
        )}
      </AccordionTrigger>
      <AccordionContent>
        {hideContent || (
          <>
            <Separator className="my-2" />
            {isContentEmpty ? (
              <div className="opacity-50">{t('common.no_content_yet')}.</div>
            ) : (
              content
            )}
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
