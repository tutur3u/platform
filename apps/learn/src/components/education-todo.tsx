'use client';
import { EducationTodo } from '@tuturuuu/ui/custom/education-todo';
import { useTranslations } from 'next-intl';
export function TodoClient({
  wsId,
  actorId,
}: {
  wsId: string;
  actorId: string;
}) {
  const t = useTranslations('educationTodo');
  return <EducationTodo actorId={actorId} app="learn" wsId={wsId} t={t} />;
}
