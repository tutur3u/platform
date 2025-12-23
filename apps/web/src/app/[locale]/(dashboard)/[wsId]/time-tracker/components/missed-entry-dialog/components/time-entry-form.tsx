import type { TimeTrackingCategory } from '@tuturuuu/types';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { getCategoryColor } from '../../session-history';
import { TaskCombobox } from '../../task-combobox';
import type { TaskWithDetails } from '../../session-history/session-types';

interface TimeEntryFormProps {
  title: string;
  description: string;
  categoryId: string;
  taskId: string;
  startTime: string;
  endTime: string;
  categories: TimeTrackingCategory[] | null;
  tasks: TaskWithDetails[] | undefined;
  isLoadingCategories: boolean;
  isLoadingTasks: boolean;
  isLoading: boolean;
  validationErrors: Record<string, string>;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onTaskChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
}

export function TimeEntryForm({
  title,
  description,
  categoryId,
  taskId,
  startTime,
  endTime,
  categories,
  tasks,
  isLoadingCategories,
  isLoadingTasks,
  isLoading,
  validationErrors,
  onTitleChange,
  onDescriptionChange,
  onCategoryChange,
  onTaskChange,
  onStartTimeChange,
  onEndTimeChange,
}: TimeEntryFormProps) {
  const t = useTranslations('time-tracker.missed_entry_dialog');

  return (
    <>
      <div>
        <Label htmlFor="missed-entry-title">{t('form.title')}</Label>
        <Input
          id="missed-entry-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t('form.titlePlaceholder')}
          disabled={isLoading}
        />
      </div>

      <div>
        <Label htmlFor="missed-entry-description">{t('form.description')}</Label>
        <Textarea
          id="missed-entry-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={t('form.descriptionPlaceholder')}
          rows={2}
          disabled={isLoading}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="missed-entry-category">{t('form.category')}</Label>
          <Select
            value={categoryId}
            onValueChange={onCategoryChange}
            disabled={isLoading || isLoadingCategories}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('form.selectCategory')} />
            </SelectTrigger>
            <SelectContent>
              {isLoadingCategories ? (
                <SelectItem value="loading" disabled>
                  {t('form.loadingCategories')}
                </SelectItem>
              ) : (
                <>
                  <SelectItem value="none">{t('form.noCategory')}</SelectItem>
                  {categories?.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-3 w-3 rounded-full',
                            getCategoryColor(category.color || 'BLUE')
                          )}
                        />
                        {category.name}
                      </div>
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="missed-entry-task">{t('form.task')}</Label>
          <TaskCombobox
            id="missed-entry-task"
            value={taskId}
            onValueChange={onTaskChange}
            tasks={tasks}
            isLoading={isLoadingTasks}
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div>
          <Label htmlFor="missed-entry-start-time">{t('form.startTime')}</Label>
          <Input
            id="missed-entry-start-time"
            type="datetime-local"
            value={startTime}
            onChange={(e) => onStartTimeChange(e.target.value)}
            disabled={isLoading}
            className={validationErrors.startTime ? 'border-dynamic-red' : ''}
          />
        </div>

        <div>
          <Label htmlFor="missed-entry-end-time">{t('form.endTime')}</Label>
          <Input
            id="missed-entry-end-time"
            type="datetime-local"
            value={endTime}
            onChange={(e) => onEndTimeChange(e.target.value)}
            disabled={isLoading}
            className={validationErrors.endTime ? 'border-dynamic-red' : ''}
          />
        </div>
      </div>
    </>
  );
}
