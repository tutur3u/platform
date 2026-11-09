'use client';

import { useTranslations } from 'next-intl';

export type TaskColor = 'gray' | 'blue' | 'green' | 'purple' | 'orange';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface DemoList {
  id: string;
  name: string;
  color: TaskColor;
}

export interface DemoTask {
  id: string;
  name: string;
  listId: string;
  ticketId: string;
  priority?: TaskPriority;
  labels?: { name: string; color: TaskColor }[];
  dueDate?: string;
  assignees?: { initials: string; color: TaskColor }[];
  estimationPoints?: number;
}

/**
 * Board fixtures for the landing demo. Kept beside the component but out of it
 * so the rendering file stays readable.
 */
export function useKanbanData(): { lists: DemoList[]; tasks: DemoTask[] } {
  const t = useTranslations('landing.demo.kanban');

  const lists: DemoList[] = [
    { id: 'todo', name: t('columns.todo'), color: 'gray' },
    { id: 'in-progress', name: t('columns.inProgress'), color: 'blue' },
    { id: 'done', name: t('columns.done'), color: 'green' },
  ];

  const tasks: DemoTask[] = [
    {
      id: '1',
      name: t('tasks.task1.name'),
      listId: 'todo',
      ticketId: 'TU-101',
      priority: 'high',
      labels: [{ name: t('tasks.task1.label'), color: 'purple' }],
      dueDate: t('tasks.task1.dueDate'),
      assignees: [
        { initials: 'JD', color: 'blue' },
        { initials: 'KL', color: 'green' },
      ],
    },
    {
      id: '2',
      name: t('tasks.task2.name'),
      listId: 'todo',
      ticketId: 'TU-102',
      priority: 'medium',
      labels: [{ name: t('tasks.task2.label'), color: 'orange' }],
      estimationPoints: 3,
    },
    {
      id: '3',
      name: t('tasks.task3.name'),
      listId: 'in-progress',
      ticketId: 'TU-98',
      priority: 'high',
      labels: [{ name: t('tasks.task3.label'), color: 'blue' }],
      dueDate: t('tasks.task3.dueDate'),
      assignees: [{ initials: 'MR', color: 'purple' }],
      estimationPoints: 5,
    },
    {
      id: '4',
      name: t('tasks.task4.name'),
      listId: 'in-progress',
      ticketId: 'TU-99',
      priority: 'low',
      labels: [{ name: t('tasks.task4.label'), color: 'green' }],
      assignees: [{ initials: 'AS', color: 'orange' }],
    },
    {
      id: '5',
      name: t('tasks.task5.name'),
      listId: 'done',
      ticketId: 'TU-95',
      labels: [{ name: t('tasks.task5.label'), color: 'blue' }],
      assignees: [{ initials: 'JD', color: 'blue' }],
      estimationPoints: 2,
    },
    {
      id: '6',
      name: t('tasks.task6.name'),
      listId: 'done',
      ticketId: 'TU-96',
      labels: [{ name: t('tasks.task6.label'), color: 'purple' }],
    },
  ];

  return { lists, tasks };
}
