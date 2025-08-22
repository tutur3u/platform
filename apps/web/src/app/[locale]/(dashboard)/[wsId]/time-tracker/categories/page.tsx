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

export default function TimeTrackerCategoriesPage() {
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
          <Input placeholder="Search categories..." className="pl-10" />
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
                <Input id="category-budget" type="number" placeholder="40" />
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Categories
            </CardTitle>
            <FolderSync className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
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
            <div className="text-2xl font-bold">10</div>
            <p className="text-xs text-muted-foreground">Currently in use</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2,156.5h</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Usage</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">179.7h</div>
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
          <div className="space-y-4">
            {/* Sample Categories */}
            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-4 w-4 rounded-full bg-blue-500"></div>
                <div>
                  <h3 className="font-medium">Development</h3>
                  <p className="text-sm text-muted-foreground">
                    Software development and coding tasks
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Budget: 160h/month</span>
                    <span>Used: 145.5h</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Active</Badge>
                <div className="text-right">
                  <div className="font-semibold">145.5h</div>
                  <div className="text-xs text-muted-foreground">
                    91% of budget
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

            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-4 w-4 rounded-full bg-green-500"></div>
                <div>
                  <h3 className="font-medium">Design</h3>
                  <p className="text-sm text-muted-foreground">
                    UI/UX design and creative work
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Budget: 80h/month</span>
                    <span>Used: 67.2h</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Active</Badge>
                <div className="text-right">
                  <div className="font-semibold">67.2h</div>
                  <div className="text-xs text-muted-foreground">
                    84% of budget
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

            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-4 w-4 rounded-full bg-yellow-500"></div>
                <div>
                  <h3 className="font-medium">Research</h3>
                  <p className="text-sm text-muted-foreground">
                    Market research and analysis
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Budget: 40h/month</span>
                    <span>Used: 38.8h</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Active</Badge>
                <div className="text-right">
                  <div className="font-semibold">38.8h</div>
                  <div className="text-xs text-muted-foreground">
                    97% of budget
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

            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-4 w-4 rounded-full bg-purple-500"></div>
                <div>
                  <h3 className="font-medium">Meetings</h3>
                  <p className="text-sm text-muted-foreground">
                    Team meetings and client calls
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Budget: 60h/month</span>
                    <span>Used: 52.1h</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Active</Badge>
                <div className="text-right">
                  <div className="font-semibold">52.1h</div>
                  <div className="text-xs text-muted-foreground">
                    87% of budget
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

            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-4 w-4 rounded-full bg-orange-500"></div>
                <div>
                  <h3 className="font-medium">Documentation</h3>
                  <p className="text-sm text-muted-foreground">
                    Writing and maintaining documentation
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Budget: 30h/month</span>
                    <span>Used: 25.3h</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Active</Badge>
                <div className="text-right">
                  <div className="font-semibold">25.3h</div>
                  <div className="text-xs text-muted-foreground">
                    84% of budget
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

            <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50">
              <div className="flex items-center gap-4">
                <div className="h-4 w-4 rounded-full bg-red-500"></div>
                <div>
                  <h3 className="font-medium">Bug Fixes</h3>
                  <p className="text-sm text-muted-foreground">
                    Bug fixes and maintenance
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Budget: 20h/month</span>
                    <span>Used: 18.7h</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Active</Badge>
                <div className="text-right">
                  <div className="font-semibold">18.7h</div>
                  <div className="text-xs text-muted-foreground">
                    94% of budget
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
          </div>
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
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            Chart placeholder - Category usage visualization
          </div>
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
