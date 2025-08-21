import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { CircleCheck, Clock, Filter, Plus, Search } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';

export default function TimeTrackerTasksPage() {
  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <CircleCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Time Tracker Tasks</h1>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
          <Input placeholder="Search tasks..." className="pl-10" />
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
        <Button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </div>

      {/* Task Statistics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <CircleCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">24</div>
            <p className="text-xs text-muted-foreground">+3 new this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CircleCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <Clock className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">4</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Task List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Tasks</CardTitle>
          <CardDescription>
            Tasks that need time tracking attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Sample Tasks */}
            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-blue-500"></div>
                <div>
                  <h3 className="font-medium">Design System Update</h3>
                  <p className="text-sm text-muted-foreground">
                    Update component library with new design tokens
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Design</Badge>
                <div className="text-sm text-muted-foreground">2h 30m</div>
                <Button variant="outline" size="sm">
                  Start Timer
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <div>
                  <h3 className="font-medium">API Documentation</h3>
                  <p className="text-sm text-muted-foreground">
                    Write comprehensive API documentation
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Development</Badge>
                <div className="text-sm text-muted-foreground">4h 15m</div>
                <Button variant="outline" size="sm">
                  Start Timer
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                <div>
                  <h3 className="font-medium">User Research</h3>
                  <p className="text-sm text-muted-foreground">
                    Conduct user interviews for new feature
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Research</Badge>
                <div className="text-sm text-muted-foreground">1h 45m</div>
                <Button variant="outline" size="sm">
                  Start Timer
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-red-500"></div>
                <div>
                  <h3 className="font-medium">Bug Fixes</h3>
                  <p className="text-sm text-muted-foreground">
                    Fix critical bugs in production
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="destructive">Urgent</Badge>
                <div className="text-sm text-muted-foreground">3h 20m</div>
                <Button variant="outline" size="sm">
                  Start Timer
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common time tracking actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Clock className="h-6 w-6" />
              <span>Start Break Timer</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <CircleCheck className="h-6 w-6" />
              <span>Mark Task Complete</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Plus className="h-6 w-6" />
              <span>Create Time Entry</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
