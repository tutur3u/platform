'use client';

import { useRouter } from 'next/navigation';
import DynamicQuizForm from './dynamic-form';

interface Props {
  locale: string;
  wsId: string;
  moduleId: string;
  courseId: string;
}

export default function NewQuizClient({
  locale,
  wsId,
  moduleId,
  courseId,
}: Props) {
  const router = useRouter();

  return (
    <DynamicQuizForm
      wsId={wsId}
      moduleId={moduleId}
      onFinish={() =>
        router.push(
          `/${locale}/${wsId}/education/courses/${courseId}/modules/${moduleId}/quizzes`
        )
      }
    />
  );
}
