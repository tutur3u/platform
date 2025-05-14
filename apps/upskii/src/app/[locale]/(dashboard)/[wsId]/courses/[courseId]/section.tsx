import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Separator } from '@tuturuuu/ui/separator';
import { isEqual } from 'lodash';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ReactNode } from 'react';

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
  rawContent?: any;
  content?: ReactNode;
  hideContent?: boolean;
}) {
  const t = await getTranslations();

  const isContentEmpty =
    !hideContent &&
    (rawContent
      ? isEqual(rawContent, {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
            },
          ],
        })
      : !content);

  return (
    <AccordionItem
      value={title}
      className="border-foreground/10 bg-foreground/5 rounded-lg border px-4"
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
