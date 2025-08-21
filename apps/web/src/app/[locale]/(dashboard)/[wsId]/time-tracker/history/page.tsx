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
  Calendar,
  Clock,
  Download,
  Eye,
  Filter,
  Search,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';

export default function TimeTrackerHistoryPage() {
  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <Clock className="h-6 w-6 text-primary" />
        <h1 className="font-bold text-2xl">Time Tracker History</h1>
      </div>

      {/* Search and Filter Bar */}
      <Card>
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
          <CardDescription>
            Find specific time entries in your history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-muted-foreground" />
              <Input placeholder="Search entries..." className="pl-10" />
            </div>
            <Input type="date" placeholder="Start date" />
            <Input type="date" placeholder="End date" />
            <Button variant="outline" className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Entries</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">1,247</div>
            <p className="text-muted-foreground text-xs">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">2,156.5h</div>
            <p className="text-muted-foreground text-xs">
              +15.2% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Active Projects
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">12</div>
            <p className="text-muted-foreground text-xs">Currently tracking</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Avg. Daily Hours
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">7.8h</div>
            <p className="text-muted-foreground text-xs">Target: 8.0h</p>
          </CardContent>
        </Card>
      </div>

      {/* Time Entries List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Time Entries</CardTitle>
              <CardDescription>
                Your time tracking history for the last 30 days
              </CardDescription>
            </div>
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Sample Time Entries */}
            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-blue-500"></div>
                <div>
                  <h3 className="font-medium">Design System Update</h3>
                  <p className="text-muted-foreground text-sm">
                    Updated component library with new design tokens
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-muted-foreground text-xs">
                    <span>Project: Design</span>
                    <span>Date: Aug 22, 2024</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Design</Badge>
                <div className="text-right">
                  <div className="font-semibold">2h 30m</div>
                  <div className="text-muted-foreground text-xs">
                    9:00 AM - 11:30 AM
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <div>
                  <h3 className="font-medium">API Documentation</h3>
                  <p className="text-muted-foreground text-sm">
                    Wrote comprehensive API documentation
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-muted-foreground text-xs">
                    <span>Project: Development</span>
                    <span>Date: Aug 21, 2024</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Development</Badge>
                <div className="text-right">
                  <div className="font-semibold">4h 15m</div>
                  <div className="text-muted-foreground text-xs">
                    1:00 PM - 5:15 PM
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                <div>
                  <h3 className="font-medium">User Research</h3>
                  <p className="text-muted-foreground text-sm">
                    Conducted user interviews for new feature
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-muted-foreground text-xs">
                    <span>Project: Research</span>
                    <span>Date: Aug 20, 2024</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Research</Badge>
                <div className="text-right">
                  <div className="font-semibold">1h 45m</div>
                  <div className="text-muted-foreground text-xs">
                    10:00 AM - 11:45 AM
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-purple-500"></div>
                <div>
                  <h3 className="font-medium">Team Meeting</h3>
                  <p className="text-muted-foreground text-sm">
                    Weekly team sync and planning
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-muted-foreground text-xs">
                    <span>Project: Meetings</span>
                    <span>Date: Aug 19, 2024</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Meetings</Badge>
                <div className="text-right">
                  <div className="font-semibold">1h 0m</div>
                  <div className="text-muted-foreground text-xs">
                    2:00 PM - 3:00 PM
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-red-500"></div>
                <div>
                  <h3 className="font-medium">Bug Fixes</h3>
                  <p className="text-muted-foreground text-sm">
                    Fixed critical bugs in production
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-muted-foreground text-xs">
                    <span>Project: Development</span>
                    <span>Date: Aug 18, 2024</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="destructive">Urgent</Badge>
                <div className="text-right">
                  <div className="font-semibold">3h 20m</div>
                  <div className="text-muted-foreground text-xs">
                    6:00 PM - 9:20 PM
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between border-t pt-6">
            <div className="text-muted-foreground text-sm">
              Showing 1-5 of 1,247 entries
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                Previous
              </Button>
              <Button variant="outline" size="sm">
                1
              </Button>
              <Button variant="outline" size="sm">
                2
              </Button>
              <Button variant="outline" size="sm">
                3
              </Button>
              <Button variant="outline" size="sm">
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common actions for managing your time history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Download className="h-6 w-6" />
              <span>Export History</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Calendar className="h-6 w-6" />
              <span>View Calendar</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Clock className="h-6 w-6" />
              <span>Start New Timer</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
