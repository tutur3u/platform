import { FormDescription } from '@tuturuuu/ui/form';
import { useTranslations } from 'next-intl';

export function CharacterCount({
  maxLength,
  value,
}: {
  maxLength: number;
  value: string | undefined;
}) {
  const commonT = useTranslations('common');

  return (
    <FormDescription className="text-right text-xs">
      {(value?.length ?? 0).toLocaleString()}/{maxLength.toLocaleString()}{' '}
      {commonT('characters')}
    </FormDescription>
  );
}
