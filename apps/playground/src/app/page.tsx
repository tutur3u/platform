'use client';

import type { Task } from '@tuturuuu/ai/playground/object-generation';
import { useEffect, useState } from 'react';

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [taskData, setTaskData] = useState<Task | null>(null);

  useEffect(() => {
    const fetchTask = async () => {
      setIsLoading(true);
      const task = await fetch('/api/ai/object-generation');
      const taskData = await task.json();
      setTaskData(taskData);
      setIsLoading(false);
    };
    fetchTask();
  }, []);

  return (
    <div className="grid min-h-screen items-center justify-items-center gap-8 p-8">
      {isLoading ? (
        <div className="font-bold text-2xl">Loading...</div>
      ) : (
        <pre className="whitespace-pre-wrap">
          {JSON.stringify(taskData, null, 2)}
        </pre>
      )}
    </div>
  );
}
