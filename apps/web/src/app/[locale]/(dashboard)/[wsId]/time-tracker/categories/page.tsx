import { getTranslations } from 'next-intl/server';
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

export default async function TimeTrackerCategoriesPage() {
  const t = await getTranslations();
  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <FolderSync className="h-6 w-6 text-primary" />
        <h1 className="font-bold text-2xl">{t('time-tracker.categories.title')}</h1>
      </div>

      {/* Search and Actions Bar */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-muted-foreground" />
          <Input placeholder={t('time-tracker.categories.search_placeholder')} className="pl-10" />
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          {t('time-tracker.categories.filter')}
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {t('time-tracker.categories.new_category')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('time-tracker.categories.create_title')}</DialogTitle>
              <DialogDescription>
                {t('time-tracker.categories.create_description')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">{t('time-tracker.categories.name_label')}</Label>
                <Input
                  id="category-name"
                  placeholder={t('time-tracker.categories.name_placeholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-description">{t('time-tracker.categories.description_label')}</Label>
                <Input
                  id="category-description"
                  placeholder={t('time-tracker.categories.description_placeholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-color">{t('time-tracker.categories.color_label')}</Label>
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
                <Label htmlFor="category-budget">{t('time-tracker.categories.budget_label')}</Label>
                <Input id="category-budget" type="number" placeholder="40" min={0} step={1} />
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
            <CardTitle className="font-medium text-sm">
              Total Categories
            </CardTitle>
            <FolderSync className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">12</div>
            <p className="text-muted-foreground text-xs">+2 new this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Active Categories
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">10</div>
            <p className="text-muted-foreground text-xs">Currently in use</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">2,156.5h</div>
            <p className="text-muted-foreground text-xs">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Avg. Usage</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">179.7h</div>
            <p className="text-muted-foreground text-xs">Per category</p>
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
                  <p className="text-muted-foreground text-sm">
                    Software development and coding tasks
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-muted-foreground text-xs">
                    <span>Budget: 160h/month</span>
                    <span>Used: 145.5h</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Active</Badge>
                <div className="text-right">
                  <div className="font-semibold">145.5h</div>
                  <div className="text-muted-foreground text-xs">
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
                  <p className="text-muted-foreground text-sm">
                    UI/UX design and creative work
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-muted-foreground text-xs">
                    <span>Budget: 80h/month</span>
                    <span>Used: 67.2h</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Active</Badge>
                <div className="text-right">
                  <div className="font-semibold">67.2h</div>
                  <div className="text-muted-foreground text-xs">
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
                  <p className="text-muted-foreground text-sm">
                    Market research and analysis
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-muted-foreground text-xs">
                    <span>Budget: 40h/month</span>
                    <span>Used: 38.8h</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Active</Badge>
                <div className="text-right">
                  <div className="font-semibold">38.8h</div>
                  <div className="text-muted-foreground text-xs">
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
                  <p className="text-muted-foreground text-sm">
                    Team meetings and client calls
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-muted-foreground text-xs">
                    <span>Budget: 60h/month</span>
                    <span>Used: 52.1h</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Active</Badge>
                <div className="text-right">
                  <div className="font-semibold">52.1h</div>
                  <div className="text-muted-foreground text-xs">
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
                  <p className="text-muted-foreground text-sm">
                    Writing and maintaining documentation
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-muted-foreground text-xs">
                    <span>Budget: 30h/month</span>
                    <span>Used: 25.3h</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Active</Badge>
                <div className="text-right">
                  <div className="font-semibold">25.3h</div>
                  <div className="text-muted-foreground text-xs">
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
                  <p className="text-muted-foreground text-sm">
                    Bug fixes and maintenance
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-muted-foreground text-xs">
                    <span>Budget: 20h/month</span>
                    <span>Used: 18.7h</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Active</Badge>
                <div className="text-right">
                  <div className="font-semibold">18.7h</div>
                  <div className="text-muted-foreground text-xs">
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
