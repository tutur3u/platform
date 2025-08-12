'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { EventStatus } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { CalendarIcon, MapPin, Users } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';

interface CreateScheduledEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  wsId: string;
}

interface WorkspaceMember {
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface EventFormData {
  title: string;
  description: string;
  start_date: Date | undefined;
  start_time: string;
  end_date: Date | undefined;
  end_time: string;
  location: string;
  is_all_day: boolean;
  requires_confirmation: boolean;
  color: string;
  status: EventStatus;
  selected_attendees: string[];
}

const EVENT_COLORS = [
  { value: 'blue', label: 'Blue', color: 'bg-blue-500' },
  { value: 'green', label: 'Green', color: 'bg-green-500' },
  { value: 'red', label: 'Red', color: 'bg-red-500' },
  { value: 'yellow', label: 'Yellow', color: 'bg-yellow-500' },
  { value: 'purple', label: 'Purple', color: 'bg-purple-500' },
  { value: 'pink', label: 'Pink', color: 'bg-pink-500' },
  { value: 'orange', label: 'Orange', color: 'bg-orange-500' },
  { value: 'gray', label: 'Gray', color: 'bg-gray-500' },
];

export default function CreateScheduledEventDialog({
  isOpen,
  onClose,
  wsId,
}: CreateScheduledEventDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>(
    []
  );
  const [membersLoading, setMembersLoading] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    start_date: undefined,
    start_time: '09:00',
    end_date: undefined,
    end_time: '10:00',
    location: '',
    is_all_day: false,
    requires_confirmation: true,
    color: 'blue',
    status: 'active',
    selected_attendees: [],
  });

  const supabase = createClient();

  // Load workspace members when dialog opens

  const loadWorkspaceMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const { data: membersData } = await supabase
        .from('workspace_members_and_invites')
        .select(
          `
          id,
          display_name,
          avatar_url,
          email,
          pending
        `
        )
        .eq('ws_id', wsId)
        .eq('pending', false);

      if (!membersData || membersData.length === 0) {
        console.log('No workspace members found');
        setWorkspaceMembers([]);
        return;
      }

      const transformedData: WorkspaceMember[] = membersData
        .filter(
          (member): member is typeof member & { id: string } =>
            member.id !== null
        )
        .map((member) => ({
          user_id: member.id,
          display_name: member.display_name || null,
          avatar_url: member.avatar_url || null,
          email: member.email || null,
        }));

      setWorkspaceMembers(transformedData);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to load workspace members: ${errorMessage}`);
      setWorkspaceMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [wsId, supabase]);
  useEffect(() => {
    if (isOpen) {
      loadWorkspaceMembers();
    }
  }, [isOpen, loadWorkspaceMembers]);

  const handleInputChange = useCallback(
    (
      field: keyof EventFormData,
      value: string | boolean | Date | undefined
    ) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [setFormData]
  );

  const toggleAttendee = useCallback(
    (userId: string) => {
      setFormData((prev) => ({
        ...prev,
        selected_attendees: prev.selected_attendees.includes(userId)
          ? prev.selected_attendees.filter((id) => id !== userId)
          : [...prev.selected_attendees, userId],
      }));
    },
    [setFormData]
  );

  const handleSubmit = useCallback(async () => {
    if (!formData.title.trim()) {
      toast.error('Event title is required');
      return;
    }

    if (!formData.start_date || !formData.end_date) {
      toast.error('Start and end dates are required');
      return;
    }

    if (formData.selected_attendees.length === 0) {
      toast.error('Please select at least one attendee');
      return;
    }

    setIsLoading(true);

    try {
      const start_at = formData.is_all_day
        ? format(formData.start_date, 'yyyy-MM-dd') + 'T00:00:00Z'
        : format(formData.start_date, 'yyyy-MM-dd') +
          'T' +
          formData.start_time +
          ':00Z';

      const end_at = formData.is_all_day
        ? format(formData.end_date, 'yyyy-MM-dd') + 'T23:59:59Z'
        : format(formData.end_date, 'yyyy-MM-dd') +
          'T' +
          formData.end_time +
          ':00Z';

      // Create the event
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/scheduled-events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: formData.title,
            description: formData.description,
            start_at,
            end_at,
            location: formData.location,
            color: formData.color,
            is_all_day: formData.is_all_day,
            requires_confirmation: formData.requires_confirmation,
            status: formData.status,
            attendee_ids: formData.selected_attendees,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create event');
      }

      toast.success(
        'Event created successfully! Invitations have been sent to attendees.'
      );

      // Reset form and close dialog
      setFormData({
        title: '',
        description: '',
        start_date: undefined,
        start_time: '09:00',
        end_date: undefined,
        end_time: '10:00',
        location: '',
        is_all_day: false,
        requires_confirmation: true,
        color: 'blue',
        status: 'active',
        selected_attendees: [],
      });

      onClose();
    } catch (error) {
      console.error('Error creating event:', error);
      toast.error('Failed to create event. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [wsId, formData, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Scheduled Event</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Enter event title"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  handleInputChange('description', e.target.value)
                }
                placeholder="Enter event description"
                rows={3}
              />
            </div>
          </div>

          {/* Date and Time */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_all_day"
                checked={formData.is_all_day}
                onCheckedChange={(checked) =>
                  handleInputChange('is_all_day', checked)
                }
              />
              <Label htmlFor="is_all_day">All day event</Label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Start Date */}
              <div>
                <Label>Start Date *</Label>
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !formData.start_date && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.start_date
                        ? format(formData.start_date, 'PPP')
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.start_date}
                      onSelect={(date) => {
                        handleInputChange('start_date', date);
                        if (!formData.end_date && date) {
                          handleInputChange('end_date', date);
                        }
                        setStartDateOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Start Time */}
              {!formData.is_all_day && (
                <div>
                  <Label>Start Time *</Label>
                  <Input
                    type="time"
                    value={formData.start_time}
                    onChange={(e) =>
                      handleInputChange('start_time', e.target.value)
                    }
                  />
                </div>
              )}

              {/* End Date */}
              <div>
                <Label>End Date *</Label>
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !formData.end_date && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.end_date
                        ? format(formData.end_date, 'PPP')
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.end_date}
                      onSelect={(date) => {
                        handleInputChange('end_date', date);
                        setEndDateOpen(false);
                      }}
                      disabled={(date) =>
                        formData.start_date ? date < formData.start_date : false
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Time */}
              {!formData.is_all_day && (
                <div>
                  <Label>End Time *</Label>
                  <Input
                    type="time"
                    value={formData.end_time}
                    onChange={(e) =>
                      handleInputChange('end_time', e.target.value)
                    }
                  />
                </div>
              )}
            </div>
          </div>

          {/* Location and Color */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="location">
                <MapPin className="mr-1 inline h-4 w-4" />
                Location
              </Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                placeholder="Enter location"
              />
            </div>

            <div>
              <Label>Event Color</Label>
              <Select
                value={formData.color}
                onValueChange={(value) => handleInputChange('color', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_COLORS.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center space-x-2">
                        <div
                          className={cn('h-4 w-4 rounded-full', color.color)}
                        />
                        <span>{color.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="requires_confirmation"
                checked={formData.requires_confirmation}
                onCheckedChange={(checked) =>
                  handleInputChange('requires_confirmation', checked)
                }
              />
              <Label htmlFor="requires_confirmation">
                Require attendee confirmation (attendees must vote to
                accept/decline)
              </Label>
            </div>
          </div>

          {/* Attendee Selection */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <Label>Select Attendees *</Label>
              {formData.selected_attendees.length > 0 && (
                <Badge variant="secondary">
                  {formData.selected_attendees.length} selected
                </Badge>
              )}
            </div>

            <ScrollArea className="h-48 rounded-md border p-4">
              {membersLoading ? (
                <div className="text-center text-muted-foreground">
                  Loading members...
                </div>
              ) : workspaceMembers.length === 0 ? (
                <div className="text-center text-muted-foreground">
                  No members found
                </div>
              ) : (
                <div className="space-y-2">
                  {workspaceMembers.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex cursor-pointer items-center space-x-3 rounded-md p-2 hover:bg-muted"
                      onClick={() => toggleAttendee(member.user_id)}
                    >
                      <Checkbox
                        checked={formData.selected_attendees.includes(
                          member.user_id
                        )}
                        onChange={() => toggleAttendee(member.user_id)}
                      />
                      <div className="flex-1">
                        <div className="font-medium">
                          {member.display_name || 'Unknown User'}
                        </div>
                        {member.email && (
                          <div className="text-sm text-muted-foreground">
                            {member.email}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create Event & Send Invitations'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
