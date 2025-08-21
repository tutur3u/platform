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
  Plus,
  Search,
  Target,
  Trash2,
  TrendingUp,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';

export default function TimeTrackerGoalsPage() {
  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <Target className="h-6 w-6 text-primary" />
        <h1 className="font-bold text-2xl">Time Tracker Goals</h1>
      </div>

      {/* Search and Actions Bar */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-muted-foreground" />
          <Input placeholder="Search goals..." className="pl-10" />
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Goal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Goal</DialogTitle>
              <DialogDescription>
                Set a new time tracking goal to improve your productivity.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="goal-title">Goal Title</Label>
                <Input
                  id="goal-title"
                  placeholder="e.g., Complete Project X, Learn New Technology"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-description">Description</Label>
                <Input
                  id="goal-description"
                  placeholder="Detailed description of your goal"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="goal-target">Target Hours</Label>
                  <Input id="goal-target" type="number" placeholder="100" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal-deadline">Deadline</Label>
                  <Input id="goal-deadline" type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-category">Category</Label>
                <Select defaultValue="development">
                  <SelectTrigger id="goal-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="design">Design</SelectItem>
                    <SelectItem value="research">Research</SelectItem>
                    <SelectItem value="learning">Learning</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-priority">Priority</Label>
                <Select defaultValue="medium">
                  <SelectTrigger id="goal-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline">Cancel</Button>
              <Button>Create Goal</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Goals Overview */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Goals</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">8</div>
            <p className="text-muted-foreground text-xs">+1 new this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">5</div>
            <p className="text-muted-foreground text-xs">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Completed</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">2</div>
            <p className="text-muted-foreground text-xs">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">87%</div>
            <p className="text-muted-foreground text-xs">+5% from last month</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Goals */}
      <Card>
        <CardHeader>
          <CardTitle>Active Goals</CardTitle>
          <CardDescription>
            Goals you're currently working towards
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Sample Active Goals */}
            <div className="rounded-lg border p-4">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-blue-500"></div>
                  <div>
                    <h3 className="font-medium text-lg">
                      Complete Mobile App Development
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Finish the React Native mobile application
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">High Priority</Badge>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-blue-50 p-3 text-center">
                  <div className="text-muted-foreground text-sm">
                    Target Hours
                  </div>
                  <div className="font-bold text-blue-600 text-xl">200h</div>
                </div>
                <div className="rounded-lg bg-green-50 p-3 text-center">
                  <div className="text-muted-foreground text-sm">Completed</div>
                  <div className="font-bold text-green-600 text-xl">156h</div>
                </div>
                <div className="rounded-lg bg-orange-50 p-3 text-center">
                  <div className="text-muted-foreground text-sm">Remaining</div>
                  <div className="font-bold text-orange-600 text-xl">44h</div>
                </div>
              </div>

              <div className="mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>78%</span>
                </div>
                <Progress value={78} className="h-2" />
              </div>

              <div className="flex items-center justify-between text-muted-foreground text-sm">
                <span>Deadline: December 31, 2024</span>
                <span>Category: Development</span>
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-green-500"></div>
                  <div>
                    <h3 className="font-medium text-lg">
                      Learn Advanced React Patterns
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Master advanced React concepts and patterns
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">Medium Priority</Badge>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-blue-50 p-3 text-center">
                  <div className="text-muted-foreground text-sm">
                    Target Hours
                  </div>
                  <div className="font-bold text-blue-600 text-xl">80h</div>
                </div>
                <div className="rounded-lg bg-green-50 p-3 text-center">
                  <div className="text-muted-foreground text-sm">Completed</div>
                  <div className="font-bold text-green-600 text-xl">45h</div>
                </div>
                <div className="rounded-lg bg-orange-50 p-3 text-center">
                  <div className="text-muted-foreground text-sm">Remaining</div>
                  <div className="font-bold text-orange-600 text-xl">35h</div>
                </div>
              </div>

              <div className="mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>56%</span>
                </div>
                <Progress value={56} className="h-2" />
              </div>

              <div className="flex items-center justify-between text-muted-foreground text-sm">
                <span>Deadline: November 15, 2024</span>
                <span>Category: Learning</span>
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                  <div>
                    <h3 className="font-medium text-lg">
                      Design System Overhaul
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Redesign and implement new design system
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">Medium Priority</Badge>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-blue-50 p-3 text-center">
                  <div className="text-muted-foreground text-sm">
                    Target Hours
                  </div>
                  <div className="font-bold text-blue-600 text-xl">120h</div>
                </div>
                <div className="rounded-lg bg-green-50 p-3 text-center">
                  <div className="text-muted-foreground text-sm">Completed</div>
                  <div className="font-bold text-green-600 text-xl">28h</div>
                </div>
                <div className="rounded-lg bg-orange-50 p-3 text-center">
                  <div className="text-muted-foreground text-sm">Remaining</div>
                  <div className="font-bold text-orange-600 text-xl">92h</div>
                </div>
              </div>

              <div className="mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>23%</span>
                </div>
                <Progress value={23} className="h-2" />
              </div>

              <div className="flex items-center justify-between text-muted-foreground text-sm">
                <span>Deadline: January 31, 2025</span>
                <span>Category: Design</span>
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Completed Goals */}
      <Card>
        <CardHeader>
          <CardTitle>Completed Goals</CardTitle>
          <CardDescription>Goals you've successfully achieved</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border bg-green-50 p-4">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <div>
                  <h3 className="font-medium">Complete Frontend Course</h3>
                  <p className="text-muted-foreground text-sm">
                    Finished advanced frontend development course
                  </p>
                  <div className="mt-1 text-muted-foreground text-xs">
                    Completed: 60h / Target: 60h • Finished on August 15, 2024
                  </div>
                </div>
              </div>
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800"
              >
                Completed
              </Badge>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-green-50 p-4">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <div>
                  <h3 className="font-medium">API Integration Project</h3>
                  <p className="text-muted-foreground text-sm">
                    Successfully integrated third-party APIs
                  </p>
                  <div className="mt-1 text-muted-foreground text-xs">
                    Completed: 45h / Target: 40h • Finished on August 10, 2024
                  </div>
                </div>
              </div>
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800"
              >
                Completed
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Goal Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>Goal Analytics</CardTitle>
          <CardDescription>Track your progress and performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h4 className="font-medium">Monthly Goal Completion</h4>
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                Chart placeholder - Monthly goal completion trends
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-medium">Category Performance</h4>
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                Chart placeholder - Goal performance by category
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common actions for managing your goals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Plus className="h-6 w-6" />
              <span>Add Goal</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Target className="h-6 w-6" />
              <span>View Progress</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Clock className="h-6 w-6" />
              <span>Start Timer</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
