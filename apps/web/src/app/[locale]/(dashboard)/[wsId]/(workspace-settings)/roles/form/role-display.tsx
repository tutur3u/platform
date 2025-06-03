import { SectionProps } from './index';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@ncthub/ui/form';
import { Input } from '@ncthub/ui/input';
import { useTranslations } from 'next-intl';

export default function RoleFormDisplaySection({ form }: SectionProps) {
  const t = useTranslations();

  return (
    <>
      <div className="border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue mb-2 rounded-md border p-2 text-center font-bold">
        {form.watch('name') || '-'}
      </div>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('ws-roles.name')}</FormLabel>
            <FormControl>
              <Input placeholder="Name" autoComplete="off" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
