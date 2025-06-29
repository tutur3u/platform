'use client';

import { useState } from 'react';
import { ModernTaskList } from '@/components/tasks/modern-task-list';
import { useTasks } from '@/hooks/use-tasks';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Plus } from '@tuturuuu/ui/icons';
import type { Task } from '@tuturuuu/types/primitives/TaskBoard';

// Sample data for demonstration
const SAMPLE_TASKS: Task[] = [
  {
    id: '1',
    name: 'Design new task management interface',
    description: 'Create mockups and wireframes for the improved task management system based on modern UI/UX principles.',
    list_id: 'list-1',
    priority: 1,
    start_date: '2024-01-15T10:00:00Z',
    end_date: '2024-01-20T17:00:00Z',
    archived: false,
    created_at: '2024-01-10T10:00:00Z',
    assignees: [
      {
        id: 'user-1',
        display_name: 'John Doe',
        email: 'john@example.com',
        handle: 'john.doe',
      },
      {
        id: 'user-2',
        display_name: 'Jane Smith',
        email: 'jane@example.com',
        handle: 'jane.smith',
      },
    ],
  },
  {
    id: '2',
    name: 'Fix login bug',
    description: 'Critical authentication issue affecting user access.',
    list_id: 'list-1',
    priority: 1,
    start_date: '2024-01-10T10:00:00Z',
    end_date: '2024-01-15T17:00:00Z',
    archived: false,
    created_at: '2024-01-08T14:30:00Z',
    assignees: [
      {
        id: 'user-3',
        display_name: 'Alice Johnson',
        email: 'alice@example.com',
        handle: 'alice.johnson',
      },
    ],
  },
  {
    id: '3',
    name: 'Update documentation',
    description: 'Refresh API documentation with latest changes.',
    list_id: 'list-1',
    priority: 3,
    start_date: '2024-01-12T09:00:00Z',
    end_date: '2024-01-20T16:00:00Z',
    archived: true,
    created_at: '2024-01-07T11:15:00Z',
    assignees: [
      {
        id: 'user-4',
        display_name: 'Bob Wilson',
        email: 'bob@example.com',
        handle: 'bob.wilson',
      },
      {
        id: 'user-5',
        display_name: 'Carol Brown',
        email: 'carol@example.com',
        handle: 'carol.brown',
      },
    ],
  },
  {
    id: '4',
    name: 'Research competitor features',
    description: 'Study ClickUp, Asana, and Monday.com to identify best practices and innovative features we can adopt.',
    list_id: 'list-1',
    priority: 3,
    start_date: '2024-01-08T10:00:00Z',
    end_date: '2024-01-12T17:00:00Z',
    archived: true,
    created_at: '2024-01-05T08:00:00Z',
    assignees: [
      {
        id: 'user-4',
        display_name: 'Emma Thompson',
        email: 'emma@example.com',
        handle: 'emma.thompson',
      },
    ],
  },
  {
    id: '5',
    name: 'Setup automated testing',
    description: 'Create comprehensive test suite for the new task management components.',
    list_id: 'list-1',
    priority: 1,
    start_date: '2024-01-16T09:00:00Z',
    end_date: '2024-01-19T17:00:00Z',
    archived: false,
    created_at: '2024-01-13T11:45:00Z',
    assignees: [
      {
        id: 'user-5',
        display_name: 'David Park',
        email: 'david@example.com',
        handle: 'david.park',
      },
    ],
  },
  {
    id: '6',
    name: 'User feedback collection',
    description: 'Set up feedback mechanisms and conduct user interviews to validate the new design.',
    list_id: 'list-1',
    priority: 2,
    start_date: undefined,
    end_date: undefined,
    archived: false,
    created_at: '2024-01-14T16:20:00Z',
    assignees: [],
  },
  {
    id: '7',
    name: 'Performance optimization',
    description: 'Optimize rendering performance for large task lists and implement virtual scrolling if needed.',
    list_id: 'list-1',
    priority: 3,
    start_date: '2024-01-01T10:00:00Z',
    end_date: '2024-01-10T17:00:00Z',
    archived: false,
    created_at: '2024-01-01T10:00:00Z',
    assignees: [
      {
        id: 'user-3',
        display_name: 'Alex Rodriguez',
        email: 'alex@example.com',
        handle: 'alex.rodriguez',
      },
      {
        id: 'user-5',
        display_name: 'David Park',
        email: 'david@example.com',
        handle: 'david.park',
      },
    ],
  },
];

export default function TaskManagementDemo() {
  const {
    tasks,
    loading,
    addTask,
    handleTaskAction,
    handleBulkAction,
  } = useTasks(SAMPLE_TASKS);

  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  const handleAddSampleTask = () => {
    const sampleTasks = [
      {
        name: 'Review pull requests',
        description: 'Review and approve pending pull requests from the development team.',
        list_id: 'list-1',
        priority: 2,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days from now
        archived: false,
        assignees: [],
      },
      {
        name: 'Update documentation',
        description: 'Update the API documentation with the latest changes and examples.',
        list_id: 'list-1',
        priority: 3,
        start_date: undefined,
        end_date: undefined,
        archived: false,
        assignees: [],
      },
      {
        name: 'Client meeting preparation',
        description: 'Prepare presentation materials for the upcoming client meeting on project progress.',
        list_id: 'list-1',
        priority: 1,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 1 day from now
        archived: false,
        assignees: [],
      },
    ];

    const randomTask = sampleTasks[Math.floor(Math.random() * sampleTasks.length)];
    if (randomTask) {
      addTask(randomTask);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-gray-900">
            Modern Task Management Demo
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Experience the new and improved task management interface with modern design patterns, 
            advanced filtering, and seamless user interactions.
          </p>
        </div>

        {/* Features Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Smart Filtering</CardTitle>
              <CardDescription>
                Advanced filters for priority, due dates, and assignees with instant search.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bulk Operations</CardTitle>
              <CardDescription>
                Select multiple tasks and perform actions like archive or delete in bulk.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Modern UI</CardTitle>
              <CardDescription>
                Clean, intuitive interface with hover states and contextual actions.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Demo Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Interactive Demo
              <Button onClick={handleAddSampleTask} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Sample Task
              </Button>
            </CardTitle>
            <CardDescription>
              Try out the features below: search, filter, select tasks, and use the action menus.
              The interface responds to all interactions with sample data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Task List Component */}
            <ModernTaskList
              tasks={tasks}
              loading={loading}
              onTaskSelect={(taskId) => console.log('Task selected:', taskId)}
              onTasksSelect={setSelectedTasks}
              onTaskAction={handleTaskAction}
              onBulkAction={handleBulkAction}
              className="mt-4"
            />
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Try These Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">Search & Filter</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>• Use the search box to find tasks by name or description</li>
                  <li>• Click "Filter" to filter by priority or due date</li>
                  <li>• Sort tasks by clicking "Sort by date"</li>
                  <li>• Clear all filters with the "Clear" button</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Task Actions</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>• Select individual tasks with checkboxes</li>
                  <li>• Use "Select all" to select all visible tasks</li>
                  <li>• Hover over tasks to see the action menu (⋯)</li>
                  <li>• Try bulk actions when multiple tasks are selected</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Selection Info */}
        {selectedTasks.length > 0 && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <p className="text-blue-800">
                <strong>{selectedTasks.length}</strong> task{selectedTasks.length !== 1 ? 's' : ''} selected. 
                Try using the bulk actions in the header.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
} 