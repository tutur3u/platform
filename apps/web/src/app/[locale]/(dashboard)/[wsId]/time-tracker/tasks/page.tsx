import { Suspense } from 'react';
import Loading from '../loading';
import { TasksContent } from './tasks-content';

export default function TasksPage() {
  return (
    <Suspense fallback={<Loading />}>
      <TasksContent />
    </Suspense>
  );
}
