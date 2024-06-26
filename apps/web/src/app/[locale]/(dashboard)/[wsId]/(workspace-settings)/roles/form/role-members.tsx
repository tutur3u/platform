import { SectionProps } from './index';

export default function RoleFormMembersSection({ form }: SectionProps) {
  return (
    <>
      {form.watch('name') && (
        <div className="bg-dynamic-blue/10 border-dynamic-blue/20 text-dynamic-blue mb-2 rounded-md border p-2 text-center font-bold">
          {form.watch('name')}
        </div>
      )}
    </>
  );
}
