import Loading from '../loading';
import { TasksContent } from './tasks-content';
import { Suspense } from 'react';

export default function TasksPage() {
  return (
    <Suspense fallback={<Loading />}>
      <TasksContent />
    </Suspense>
  );
}
