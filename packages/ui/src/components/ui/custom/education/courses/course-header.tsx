import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { GraduationCap } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function CourseHeader({
  href,
  data,
}: {
  href: string;
  data: UserGroup;
}) {
  const t = useTranslations();
  return (
    <FeatureSummary
      title={
        <h1 className="flex w-full items-center gap-2 text-2xl font-bold">
          <div className="flex items-center gap-2 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/10 px-2 text-lg text-dynamic-blue max-md:hidden">
            <GraduationCap className="h-6 w-6" />
            {t('ws-courses.singular')}
          </div>
          <Link
            href={href}
            className="line-clamp-1 text-lg font-bold hover:underline md:text-2xl"
          >
            {data.name || t('common.unknown')}
          </Link>
        </h1>
      }
      description={
        <div className="mt-2 line-clamp-2">
          {data.description || t('ws-courses.no_description_provided')}
        </div>
      }
    />
  );
}
