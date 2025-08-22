'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Clock,
  Edit,
  Filter,
  FolderSync,
  Plus,
  Search,
  Trash2,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useParams } from 'next/navigation';
import { useState } from 'react';

// Helper function to format duration
const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

// Helper function to get color class
const getColorClass = (color: string): string => {
  const colorMap: Record<string, string> = {
    red: 'bg-red-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    blue: 'bg-blue-500',
  };
  return colorMap[color] || 'bg-blue-500';
};

export default function TimeTrackerCategoriesPage() {
  const params = useParams();
  const wsId = params.wsId as string;
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch real categories data
  const { data: categoriesData, isLoading } = useQuery({
    queryKey: ['time-tracking-categories', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/categories`
      );
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    },
    refetchInterval: 300000, // 5 minutes
  });

  // Fetch category statistics
  const { data: statsData } = useQuery({
    queryKey: ['time-tracking-category-stats', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/categories?type=stats`
      );
      if (!response.ok) throw new Error('Failed to fetch category stats');
      return response.json();
    },
  });

  // Filter categories based on search
  const filteredCategories =
    categoriesData?.categories?.filter(
      (category: any) =>
        category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        category.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  // Calculate real statistics
  const totalCategories = statsData?.totalCategories || 0;
  const activeCategories = statsData?.activeCategories || 0;
  const totalHours = statsData?.totalHours || 0;
  const avgUsage = totalCategories > 0 ? totalHours / totalCategories : 0;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <FolderSync className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Time Tracker Categories</h1>
      </div>

      {/* Search and Actions Bar */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Category</DialogTitle>
              <DialogDescription>
                Add a new category to organize your time tracking entries.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">Category Name</Label>
                <Input
                  id="category-name"
                  placeholder="e.g., Development, Design, Research"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-description">Description</Label>
                <Input
                  id="category-description"
                  placeholder="Brief description of this category"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-color">Color</Label>
                <Select defaultValue="blue">
                  <SelectTrigger id="category-color">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blue">Blue</SelectItem>
                    <SelectItem value="green">Green</SelectItem>
                    <SelectItem value="yellow">Yellow</SelectItem>
                    <SelectItem value="red">Red</SelectItem>
                    <SelectItem value="purple">Purple</SelectItem>
                    <SelectItem value="orange">Orange</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-budget">Time Budget (hours)</Label>
                <Input
                  id="category-budget"
                  type="number"
                  placeholder="40"
                  min={0}
                  step={1}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline">Cancel</Button>
              <Button>Create Category</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Categories Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Categories
            </CardTitle>
            <FolderSync className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCategories}</div>
            <p className="text-xs text-muted-foreground">+2 new this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Categories
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCategories}</div>
            <p className="text-xs text-muted-foreground">Currently in use</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(totalHours)}
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Usage</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(avgUsage)}</div>
            <p className="text-xs text-muted-foreground">Per category</p>
          </CardContent>
        </Card>
      </div>

      {/* Categories List */}
      <Card>
        <CardHeader>
          <CardTitle>All Categories</CardTitle>
          <CardDescription>
            Manage and organize your time tracking categories
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading categories...</div>
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">
                {searchQuery
                  ? 'No categories match your search'
                  : 'No categories available'}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCategories.map((category: any) => (
                <div
                  key={category.id}
                  className="flex flex-col gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-4 w-4 rounded-full ${getColorClass(category.color || 'blue')}`}
                    ></div>
                    <div>
                      <h3 className="font-medium">{category.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {category.description || 'No description'}
                      </p>
                      <div className="mt-1 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:gap-4">
                        <span>Budget: {category.budgetHours || 0}h/month</span>
                        <span>
                          Used: {formatDuration(category.usedTime || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <Badge variant="secondary">Active</Badge>
                    <div className="text-right">
                      <div className="font-semibold">
                        {formatDuration(category.usedTime || 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {category.budgetHours
                          ? `${Math.round(((category.usedTime || 0) / (category.budgetHours * 3600)) * 100)}% of budget`
                          : 'No budget set'}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Usage Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Category Usage Overview</CardTitle>
          <CardDescription>
            Visual representation of time distribution across categories
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCategories.length > 0 ? (
            <div className="h-64">
              {/* Chart would go here - using existing chart components */}
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Chart visualization - Category usage data available
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              No category data available for visualization
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common actions for managing categories
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Plus className="h-6 w-6" />
              <span>Add Category</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <FolderSync className="h-6 w-6" />
              <span>Import Categories</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Clock className="h-6 w-6" />
              <span>View Time Entries</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
