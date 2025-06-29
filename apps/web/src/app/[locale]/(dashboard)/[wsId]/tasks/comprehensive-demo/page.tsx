'use client';

import { useState } from 'react';
import { ModernTaskList } from '@/components/tasks/modern-task-list';
import { CalendarView } from '@/components/tasks/calendar-view';
import { AnalyticsView } from '@/components/tasks/analytics-view';
import { useTasks } from '@/hooks/use-tasks';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { 
  List, 
  Calendar,
  PieChart,
  Plus,
  Sparkles,
  Target,
  Users,
  Clock,
  TrendingUp,
} from '@tuturuuu/ui/icons';
import type { Task } from '@tuturuuu/types/primitives/TaskBoard';

// Comprehensive sample data for demonstration
const COMPREHENSIVE_SAMPLE_TASKS: Task[] = [
  {
    id: '1',
    name: 'Enhance user authentication system',
    description: 'Implement multi-factor authentication, social login options, and improve password security with better validation and encryption.',
    list_id: 'list-1',
    priority: 1,
    start_date: '2024-01-15T09:00:00Z',
    end_date: '2024-01-25T17:00:00Z',
    archived: false,
    created_at: '2024-01-10T10:00:00Z',
    assignees: [
      {
        id: 'user-1',
        display_name: 'Sarah Johnson',
        email: 'sarah@example.com',
        handle: 'sarah.johnson',
      },
      {
        id: 'user-2',
        display_name: 'Mike Chen',
        email: 'mike@example.com',
        handle: 'mike.chen',
      },
    ],
  },
  {
    id: '2',
    name: 'Implement real-time notifications',
    description: 'Add WebSocket-based real-time notifications for task updates, mentions, and deadline reminders.',
    list_id: 'list-1',
    priority: 2,
    start_date: '2024-01-18T09:00:00Z',
    end_date: '2024-01-28T18:00:00Z',
    archived: false,
    created_at: '2024-01-12T14:30:00Z',
    assignees: [
      {
        id: 'user-3',
        display_name: 'Alex Rodriguez',
        email: 'alex@example.com',
        handle: 'alex.rodriguez',
      },
    ],
  },
  {
    id: '3',
    name: 'Mobile app responsive improvements',
    description: 'Optimize the task management interface for mobile devices with touch-friendly interactions and improved performance.',
    list_id: 'list-1',
    priority: 2,
    start_date: '2024-01-20T11:00:00Z',
    end_date: '2024-01-30T16:00:00Z',
    archived: false,
    created_at: '2024-01-11T09:15:00Z',
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
    id: '4',
    name: 'API documentation update',
    description: 'Update comprehensive API documentation with new endpoints, examples, and interactive playground.',
    list_id: 'list-1',
    priority: 3,
    start_date: '2024-01-08T10:00:00Z',
    end_date: '2024-01-15T17:00:00Z',
    archived: true,
    created_at: '2024-01-05T08:00:00Z',
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
    id: '5',
    name: 'Performance optimization',
    description: 'Optimize database queries, implement caching, and improve overall application performance.',
    list_id: 'list-1',
    priority: 1,
    start_date: '2024-01-22T09:00:00Z',
    end_date: '2024-01-26T17:00:00Z',
    archived: false,
    created_at: '2024-01-13T11:45:00Z',
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
  {
    id: '6',
    name: 'User feedback collection system',
    description: 'Implement in-app feedback collection with rating system and categorization.',
    list_id: 'list-1',
    priority: 2,
    start_date: undefined,
    end_date: '2024-02-05T17:00:00Z',
    archived: false,
    created_at: '2024-01-14T16:20:00Z',
    assignees: [
      {
        id: 'user-1',
        display_name: 'Sarah Johnson',
        email: 'sarah@example.com',
        handle: 'sarah.johnson',
      },
    ],
  },
  {
    id: '7',
    name: 'Security audit and improvements',
    description: 'Conduct comprehensive security audit and implement recommended security improvements.',
    list_id: 'list-1',
    priority: 1,
    start_date: '2024-01-01T10:00:00Z',
    end_date: '2024-01-12T17:00:00Z',
    archived: false,
    created_at: '2024-01-01T10:00:00Z',
    assignees: [
      {
        id: 'user-6',
        display_name: 'Lisa Wang',
        email: 'lisa@example.com',
        handle: 'lisa.wang',
      },
    ],
  },
  {
    id: '8',
    name: 'Team collaboration features',
    description: 'Add team chat, file sharing, and collaborative editing features to enhance team productivity.',
    list_id: 'list-1',
    priority: 2,
    start_date: '2024-01-25T09:00:00Z',
    end_date: '2024-02-10T17:00:00Z',
    archived: false,
    created_at: '2024-01-15T14:00:00Z',
    assignees: [
      {
        id: 'user-2',
        display_name: 'Mike Chen',
        email: 'mike@example.com',
        handle: 'mike.chen',
      },
      {
        id: 'user-4',
        display_name: 'Emma Thompson',
        email: 'emma@example.com',
        handle: 'emma.thompson',
      },
    ],
  },
  {
    id: '9',
    name: 'Automated testing suite',
    description: 'Implement comprehensive automated testing including unit tests, integration tests, and E2E tests.',
    list_id: 'list-1',
    priority: 3,
    start_date: '2024-01-16T09:00:00Z',
    end_date: '2024-01-24T17:00:00Z',
    archived: true,
    created_at: '2024-01-08T10:30:00Z',
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
    id: '10',
    name: 'Data export and import features',
    description: 'Allow users to export their data in various formats (JSON, CSV, PDF) and import from other task management tools.',
    list_id: 'list-1',
    priority: 3,
    start_date: '2024-01-29T10:00:00Z',
    end_date: '2024-02-08T17:00:00Z',
    archived: false,
    created_at: '2024-01-16T13:15:00Z',
    assignees: [
      {
        id: 'user-6',
        display_name: 'Lisa Wang',
        email: 'lisa@example.com',
        handle: 'lisa.wang',
      },
    ],
  },
  {
    id: '11',
    name: 'Analytics and reporting dashboard',
    description: 'Create comprehensive analytics dashboard with task completion rates, team productivity metrics, and custom reports.',
    list_id: 'list-1',
    priority: 2,
    start_date: '2024-02-01T09:00:00Z',
    end_date: '2024-02-15T17:00:00Z',
    archived: false,
    created_at: '2024-01-17T11:00:00Z',
    assignees: [
      {
        id: 'user-7',
        display_name: 'Robert Kim',
        email: 'robert@example.com',
        handle: 'robert.kim',
      },
    ],
  },
  {
    id: '12',
    name: 'Integration with external tools',
    description: 'Build integrations with popular tools like Slack, GitHub, Jira, and Google Workspace for seamless workflow.',
    list_id: 'list-1',
    priority: 2,
    start_date: '2024-01-30T10:00:00Z',
    end_date: '2024-02-12T17:00:00Z',
    archived: false,
    created_at: '2024-01-18T09:30:00Z',
    assignees: [
      {
        id: 'user-8',
        display_name: 'Jennifer Lopez',
        email: 'jennifer@example.com',
        handle: 'jennifer.lopez',
      },
      {
        id: 'user-9',
        display_name: 'Michael Brown',
        email: 'michael@example.com',
        handle: 'michael.brown',
      },
    ],
  },
];

const FEATURE_HIGHLIGHTS = [
  {
    icon: List,
    title: 'Smart List View',
    description: 'Advanced filtering, search, and bulk operations with modern card-based design',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
  },
  {
    icon: Calendar,
    title: 'Calendar Timeline',
    description: 'Visual timeline with week/month views, date-based task organization',
    color: 'bg-green-50 border-green-200 text-green-700',
  },
  {
    icon: PieChart,
    title: 'Advanced Analytics',
    description: 'Comprehensive insights, team performance metrics, and productivity trends',
    color: 'bg-purple-50 border-purple-200 text-purple-700',
  },
  {
    icon: Target,
    title: 'Priority Management',
    description: 'Visual priority indicators, overdue warnings, and intelligent task sorting',
    color: 'bg-orange-50 border-orange-200 text-orange-700',
  },
];

export default function ComprehensiveTaskDemo() {
  const {
    tasks,
    loading,
    addTask,
    handleTaskAction,
    handleBulkAction,
  } = useTasks(COMPREHENSIVE_SAMPLE_TASKS);

  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('smart-list');

  const handleAddSampleTask = () => {
    const sampleTasks: Task[] = [
      {
        id: '1',
        name: 'Enhance user authentication system',
        description: 'Implement multi-factor authentication, social login options, and improve password security with better validation and encryption.',
        list_id: 'list-1',
        priority: 1,
        start_date: '2024-01-15T09:00:00Z',
        end_date: '2024-01-25T17:00:00Z',
        archived: false,
        created_at: '2024-01-10T10:00:00Z',
        assignees: [
          {
            id: 'user-1',
            display_name: 'Sarah Johnson',
            email: 'sarah@example.com',
            handle: 'sarah.johnson',
          },
          {
            id: 'user-2',
            display_name: 'Mike Chen',
            email: 'mike@example.com',
            handle: 'mike.chen',
          },
        ],
      },
      {
        id: '2',
        name: 'Implement real-time notifications',
        description: 'Add WebSocket-based real-time notifications for task updates, mentions, and deadline reminders.',
        list_id: 'list-1',
        priority: 2,
        start_date: '2024-01-18T09:00:00Z',
        end_date: '2024-01-28T18:00:00Z',
        archived: false,
        created_at: '2024-01-12T14:30:00Z',
        assignees: [
          {
            id: 'user-3',
            display_name: 'Alex Rodriguez',
            email: 'alex@example.com',
            handle: 'alex.rodriguez',
          },
        ],
      },
      {
        id: '3',
        name: 'Mobile app responsive improvements',
        description: 'Optimize the task management interface for mobile devices with touch-friendly interactions and improved performance.',
        list_id: 'list-1',
        priority: 2,
        start_date: '2024-01-20T11:00:00Z',
        end_date: '2024-01-30T16:00:00Z',
        archived: false,
        created_at: '2024-01-11T09:15:00Z',
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
        id: '4',
        name: 'API documentation update',
        description: 'Update comprehensive API documentation with new endpoints, examples, and interactive playground.',
        list_id: 'list-1',
        priority: 3,
        start_date: '2024-01-08T10:00:00Z',
        end_date: '2024-01-15T17:00:00Z',
        archived: true,
        created_at: '2024-01-05T08:00:00Z',
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
        id: '5',
        name: 'Performance optimization',
        description: 'Optimize database queries, implement caching, and improve overall application performance.',
        list_id: 'list-1',
        priority: 1,
        start_date: '2024-01-22T09:00:00Z',
        end_date: '2024-01-26T17:00:00Z',
        archived: false,
        created_at: '2024-01-13T11:45:00Z',
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
      {
        id: '6',
        name: 'User feedback collection system',
        description: 'Implement in-app feedback collection with rating system and categorization.',
        list_id: 'list-1',
        priority: 2,
        start_date: undefined,
        end_date: '2024-02-05T17:00:00Z',
        archived: false,
        created_at: '2024-01-14T16:20:00Z',
        assignees: [
          {
            id: 'user-1',
            display_name: 'Sarah Johnson',
            email: 'sarah@example.com',
            handle: 'sarah.johnson',
          },
        ],
      },
      {
        id: '7',
        name: 'Security audit and improvements',
        description: 'Conduct comprehensive security audit and implement recommended security improvements.',
        list_id: 'list-1',
        priority: 1,
        start_date: '2024-01-01T10:00:00Z',
        end_date: '2024-01-12T17:00:00Z',
        archived: false,
        created_at: '2024-01-01T10:00:00Z',
        assignees: [
          {
            id: 'user-6',
            display_name: 'Lisa Wang',
            email: 'lisa@example.com',
            handle: 'lisa.wang',
          },
        ],
      },
      {
        id: '8',
        name: 'Team collaboration features',
        description: 'Add team chat, file sharing, and collaborative editing features to enhance team productivity.',
        list_id: 'list-1',
        priority: 2,
        start_date: '2024-01-25T09:00:00Z',
        end_date: '2024-02-10T17:00:00Z',
        archived: false,
        created_at: '2024-01-15T14:00:00Z',
        assignees: [
          {
            id: 'user-2',
            display_name: 'Mike Chen',
            email: 'mike@example.com',
            handle: 'mike.chen',
          },
          {
            id: 'user-4',
            display_name: 'Emma Thompson',
            email: 'emma@example.com',
            handle: 'emma.thompson',
          },
        ],
      },
      {
        id: '9',
        name: 'Automated testing suite',
        description: 'Implement comprehensive automated testing including unit tests, integration tests, and E2E tests.',
        list_id: 'list-1',
        priority: 3,
        start_date: '2024-01-16T09:00:00Z',
        end_date: '2024-01-24T17:00:00Z',
        archived: true,
        created_at: '2024-01-08T10:30:00Z',
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
        id: '10',
        name: 'Data export and import features',
        description: 'Allow users to export their data in various formats (JSON, CSV, PDF) and import from other task management tools.',
        list_id: 'list-1',
        priority: 3,
        start_date: '2024-01-29T10:00:00Z',
        end_date: '2024-02-08T17:00:00Z',
        archived: false,
        created_at: '2024-01-16T13:15:00Z',
        assignees: [
          {
            id: 'user-6',
            display_name: 'Lisa Wang',
            email: 'lisa@example.com',
            handle: 'lisa.wang',
          },
        ],
      },
      {
        id: '11',
        name: 'Analytics and reporting dashboard',
        description: 'Create comprehensive analytics dashboard with task completion rates, team productivity metrics, and custom reports.',
        list_id: 'list-1',
        priority: 2,
        start_date: '2024-02-01T09:00:00Z',
        end_date: '2024-02-15T17:00:00Z',
        archived: false,
        created_at: '2024-01-17T11:00:00Z',
        assignees: [
          {
            id: 'user-7',
            display_name: 'Robert Kim',
            email: 'robert@example.com',
            handle: 'robert.kim',
          },
        ],
      },
      {
        id: '12',
        name: 'Integration with external tools',
        description: 'Build integrations with popular tools like Slack, GitHub, Jira, and Google Workspace for seamless workflow.',
        list_id: 'list-1',
        priority: 2,
        start_date: '2024-01-30T10:00:00Z',
        end_date: '2024-02-12T17:00:00Z',
        archived: false,
        created_at: '2024-01-18T09:30:00Z',
        assignees: [
          {
            id: 'user-8',
            display_name: 'Jennifer Lopez',
            email: 'jennifer@example.com',
            handle: 'jennifer.lopez',
          },
          {
            id: 'user-9',
            display_name: 'Michael Brown',
            email: 'michael@example.com',
            handle: 'michael.brown',
          },
        ],
      },
    ];

    const randomTask = sampleTasks[Math.floor(Math.random() * sampleTasks.length)];
    if (randomTask) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, created_at, ...taskData } = randomTask;
      addTask(taskData);
    }
  };

  // Calculate stats for overview
  const stats = {
    total: tasks.length,
    completed: tasks.filter(task => task.archived).length,
    overdue: tasks.filter(task => task.end_date && new Date(task.end_date) < new Date() && !task.archived).length,
    highPriority: tasks.filter(task => task.priority === 1).length,
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Enhanced Task Management Suite
            </h1>
          </div>
          <p className="text-xl text-gray-600 max-w-4xl mx-auto">
            Experience the complete transformation of task management with modern interfaces, 
            powerful analytics, and intelligent organization features that rival industry leaders.
          </p>
          
          {/* Quick Stats */}
          <div className="flex items-center justify-center gap-8 pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-sm text-gray-500">Total Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-sm text-gray-500">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
              <div className="text-sm text-gray-500">Overdue</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.highPriority}</div>
              <div className="text-sm text-gray-500">High Priority</div>
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURE_HIGHLIGHTS.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card key={index} className={`border-2 ${feature.color}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-6 w-6" />
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Interactive Demo */}
        <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-purple-50/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-3">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                  Interactive Demo Suite
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  Explore all enhanced views with comprehensive sample data. 
                  Switch between views to experience the full feature set.
                </CardDescription>
              </div>
              <Button onClick={handleAddSampleTask} className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600">
                <Plus className="h-4 w-4" />
                Add Sample Task
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="smart-list" className="gap-2">
                  <List className="h-4 w-4" />
                  Smart List
                </TabsTrigger>
                <TabsTrigger value="calendar" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Calendar
                </TabsTrigger>
                <TabsTrigger value="analytics" className="gap-2">
                  <PieChart className="h-4 w-4" />
                  Analytics
                </TabsTrigger>
              </TabsList>

              <TabsContent value="smart-list" className="mt-0">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Smart List View</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="h-4 w-4" />
                      <span>Advanced filtering & bulk operations</span>
                    </div>
                  </div>
                  <ModernTaskList
                    tasks={tasks}
                    loading={loading}
                    onTaskSelect={(taskId) => console.log('Task selected:', taskId)}
                    onTasksSelect={setSelectedTasks}
                    onTaskAction={handleTaskAction}
                    onBulkAction={handleBulkAction}
                    className="border rounded-lg"
                  />
                </div>
              </TabsContent>

              <TabsContent value="calendar" className="mt-0">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Calendar Timeline View</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock className="h-4 w-4" />
                      <span>Visual timeline & date organization</span>
                    </div>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <CalendarView
                      tasks={tasks}
                      onTaskSelect={(taskId) => console.log('Calendar task selected:', taskId)}
                      className="h-[600px]"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="analytics" className="mt-0">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Analytics & Insights</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <TrendingUp className="h-4 w-4" />
                      <span>Performance metrics & trends</span>
                    </div>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <AnalyticsView
                      tasks={tasks}
                      className="h-[600px]"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* User Interaction Feedback */}
        {selectedTasks.length > 0 && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-full">
                  <Target className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="font-medium text-blue-800">
                    <strong>{selectedTasks.length}</strong> task{selectedTasks.length !== 1 ? 's' : ''} selected
                  </p>
                  <p className="text-sm text-blue-600">
                    Try bulk actions in the Smart List view or explore other views to see how task selection works across different interfaces.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Key Improvements Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Key Improvements & Features</CardTitle>
            <CardDescription>
              What makes this task management system superior to the previous implementation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-semibold text-green-700">✅ Enhanced User Experience</h4>
                <ul className="space-y-2 text-sm">
                  <li>• Modern card-based layouts instead of dense tables</li>
                  <li>• Intuitive drag-and-drop interactions</li>
                  <li>• Smart filtering with multiple criteria</li>
                  <li>• Bulk operations for efficiency</li>
                  <li>• Responsive design for all devices</li>
                </ul>
              </div>
              <div className="space-y-4">
                <h4 className="font-semibold text-blue-700">📊 Advanced Analytics</h4>
                <ul className="space-y-2 text-sm">
                  <li>• Comprehensive performance metrics</li>
                  <li>• Team productivity insights</li>
                  <li>• Priority distribution analysis</li>
                  <li>• Completion time tracking</li>
                  <li>• Intelligent recommendations</li>
                </ul>
              </div>
              <div className="space-y-4">
                <h4 className="font-semibold text-purple-700">🎯 Smart Organization</h4>
                <ul className="space-y-2 text-sm">
                  <li>• Automatic overdue detection</li>
                  <li>• Priority-based visual indicators</li>
                  <li>• Calendar timeline integration</li>
                  <li>• Assignee performance tracking</li>
                  <li>• Status-based workflow management</li>
                </ul>
              </div>
              <div className="space-y-4">
                <h4 className="font-semibold text-orange-700">⚡ Performance & Reliability</h4>
                <ul className="space-y-2 text-sm">
                  <li>• Optimized rendering for large datasets</li>
                  <li>• Real-time updates and synchronization</li>
                  <li>• Error-resistant state management</li>
                  <li>• Accessibility compliance</li>
                  <li>• Cross-browser compatibility</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 