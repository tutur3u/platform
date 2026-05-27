'use client';

import { useRouter } from 'next/navigation';
import DynamicQuizForm from '../dynamic-form';

interface Props {
  wsId: string;
  moduleId: string;
  courseId: string;
}

export default function NewQuizClient({ wsId, moduleId, courseId }: Props) {
  const router = useRouter();

  return (
    <DynamicQuizForm
      wsId={wsId}
      moduleId={moduleId}
      onFinish={() =>
        router.push(
          `/${wsId}/education/courses/${courseId}/modules/${moduleId}/quizzes`
        )
      }
    />
  );
}
