import { useState, useCallback } from 'react';
import type { Task } from '@tuturuuu/types/primitives/TaskBoard';

export function useTasks(initialTasks: Task[] = []) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [loading, setLoading] = useState(false);

  const addTask = useCallback((task: Omit<Task, 'id' | 'created_at'>) => {
    const newTask: Task = {
      ...task,
      id: Math.random().toString(36).substr(2, 9), // Generate a simple ID
      created_at: new Date().toISOString(),
    };
    setTasks(prev => [newTask, ...prev]);
    return newTask;
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, ...updates } : task
    ));
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  }, []);

  const archiveTask = useCallback((taskId: string, archived: boolean = true) => {
    updateTask(taskId, { archived });
  }, [updateTask]);

  const handleTaskAction = useCallback((action: string, taskId: string) => {
    switch (action) {
      case 'edit':
        // Open edit modal or navigate to edit page
        console.log('Edit task:', taskId);
        break;
      case 'duplicate':
        const taskToDuplicate = tasks.find(t => t.id === taskId);
        if (taskToDuplicate) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, created_at, ...taskData } = taskToDuplicate;
          addTask({
            ...taskData,
            name: `${taskToDuplicate.name} (Copy)`,
          });
        }
        break;
      case 'archive':
        archiveTask(taskId, true);
        break;
      case 'unarchive':
        archiveTask(taskId, false);
        break;
      case 'delete':
        deleteTask(taskId);
        break;
      default:
        console.log('Unknown action:', action, taskId);
    }
  }, [tasks, addTask, archiveTask, deleteTask]);

  const handleBulkAction = useCallback((action: string, taskIds: string[]) => {
    switch (action) {
      case 'archive':
        taskIds.forEach(id => archiveTask(id, true));
        break;
      case 'delete':
        taskIds.forEach(id => deleteTask(id));
        break;
      default:
        console.log('Unknown bulk action:', action, taskIds);
    }
  }, [archiveTask, deleteTask]);

  return {
    tasks,
    loading,
    setLoading,
    addTask,
    updateTask,
    deleteTask,
    archiveTask,
    handleTaskAction,
    handleBulkAction,
  };
} 