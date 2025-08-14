"use client"

/**
 * Enhanced Event Details Dialog - Redesigned for Better UX
 *
 * Improvements:
 * - Better visual hierarchy and spacing
 * - More prominent RSVP actions
 * - Enhanced attendee list with better status indicators
 * - Improved response statistics with progress bars
 * - Better mobile responsiveness
 * - More intuitive layout and information architecture
 */

import type {
  EventAttendeeStatus,
  EventAttendeeWithUser,
  WorkspaceScheduledEventWithAttendees,
} from "@tuturuuu/types/primitives/RSVP"
import type { EventStatus } from "@tuturuuu/types/primitives/RSVP"
import { createClient } from "@tuturuuu/supabase/next/client"
import { Avatar, AvatarFallback, AvatarImage } from "@tuturuuu/ui/avatar"
import { Badge } from "@tuturuuu/ui/badge"
import { Button } from "@tuturuuu/ui/button"
import { Calendar } from "@tuturuuu/ui/calendar"
import { Checkbox } from "@tuturuuu/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@tuturuuu/ui/dialog"
import {
  CalendarIcon,
  Check,
  Clock,
  Edit,
  HelpCircle,
  Mail,
  MapPin,
  Trash2,
  User,
  Users,
  X,
  ChevronDown,
} from "@tuturuuu/ui/icons"
import { Input } from "@tuturuuu/ui/input"
import { Label } from "@tuturuuu/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@tuturuuu/ui/popover"
import { ScrollArea } from "@tuturuuu/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tuturuuu/ui/select"
import { Separator } from "@tuturuuu/ui/separator"
import { toast } from "@tuturuuu/ui/sonner"
import { Textarea } from "@tuturuuu/ui/textarea"
import { useCurrentUser } from "@tuturuuu/ui/hooks/use-current-user"
import { TimeSelector } from "@tuturuuu/ui/legacy/tumeet/time-selector"
import { cn } from "@tuturuuu/utils/format"
import { format } from "date-fns"
import { useCallback, useEffect, useState } from "react"
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

// Extend dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

// Helper function to get user's timezone
const getUserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC'; // Fallback if timezone detection fails
  }
};

interface EventDetailsDialogProps {
  isOpen: boolean
  onClose: () => void
  event: WorkspaceScheduledEventWithAttendees | null
  isLoading?: boolean
  wsId: string
  onEventUpdate?: (eventId: string) => void
  onEventDelete?: (eventId: string) => void
}

interface WorkspaceMember {
  user_id: string
  display_name: string | null
  email: string | null
  avatar_url: string | null
}

interface EventFormData {
  title: string
  description: string
  start_date: Date | undefined
  start_time: number | undefined
  end_date: Date | undefined
  end_time: number | undefined
  location: string
  is_all_day: boolean
  requires_confirmation: boolean
  color: string
  status: EventStatus
  selected_attendees: string[]
}

const EVENT_COLORS = [
  { value: "red", label: "Red", color: "bg-red-500" },
  { value: "blue", label: "Blue", color: "bg-blue-500" },
  { value: "green", label: "Green", color: "bg-green-500" },
  { value: "yellow", label: "Yellow", color: "bg-yellow-500" },
  { value: "orange", label: "Orange", color: "bg-orange-500" },
  { value: "purple", label: "Purple", color: "bg-purple-500" },
  { value: "pink", label: "Pink", color: "bg-pink-500" },
  { value: "indigo", label: "Indigo", color: "bg-indigo-500" },
  { value: "cyan", label: "Cyan", color: "bg-cyan-500" },
  { value: "gray", label: "Gray", color: "bg-gray-500" },
] as const

// Helper functions to convert between hour numbers and time strings
const hourToTimeString = (hour: number | undefined): string => {
  if (!hour) return '09:00';
  // Convert hour (1-24) to HH:MM format
  const adjustedHour = hour === 24 ? 0 : hour;
  return `${String(adjustedHour).padStart(2, '0')}:00`;
};

const timeStringToHour = (timeString: string): number => {
  const [hour] = timeString.split(':').map(Number);
  // Convert 0-23 hour to 1-24 format for TimeSelector
  return hour === 0 ? 24 : (hour || 1);
};

// Helper function to create datetime in user's timezone and convert to UTC
const createDateTimeInTimezone = (
  date: Date,
  timeString: string,
  userTimezone: string
): string => {
  const dateStr = format(date, 'yyyy-MM-dd');
  const datetimeStr = `${dateStr}T${timeString}:00`;
  
  // Create the datetime in the user's timezone
  const datetimeInTz = dayjs.tz(datetimeStr, userTimezone);
  
  // Convert to UTC and return as ISO string
  return datetimeInTz.utc().toISOString();
};

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
    icon: Clock,
    dotColor: "bg-amber-400",
  },
  accepted: {
    label: "Going",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
    icon: Check,
    dotColor: "bg-emerald-400",
  },
  declined: {
    label: "Not Going",
    color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300",
    icon: X,
    dotColor: "bg-red-400",
  },
  tentative: {
    label: "Maybe",
    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
    icon: HelpCircle,
    dotColor: "bg-blue-400",
  },
} as const

export default function EnhancedEventDetailsDialog({
  isOpen,
  onClose,
  event,
  isLoading = false,
  wsId,
  onEventDelete,
  onEventUpdate,
}: EventDetailsDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showAllAttendees, setShowAllAttendees] = useState(false)
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [startDateOpen, setStartDateOpen] = useState(false)
  const [endDateOpen, setEndDateOpen] = useState(false)
  const { userId: currentUserId, isLoading: userLoading } = useCurrentUser()

  // Form data for editing
  const [editFormData, setEditFormData] = useState<EventFormData>({
    title: "",
    description: "",
    start_date: undefined,
    start_time: 9, // 9 AM
    end_date: undefined,
    end_time: 10, // 10 AM
    location: "",
    is_all_day: false,
    requires_confirmation: true,
    color: "red",
    status: "active",
    selected_attendees: [],
  })

  // Initialize form data when event changes or editing mode is enabled
  useEffect(() => {
    if (event && isEditing) {
      // Get user's timezone for converting UTC times to local times
      const userTimezone = getUserTimezone();

      // Extract date and time components from UTC ISO strings, converting to user's timezone
      const extractDateAndTime = (isoString: string): { date: Date; time: string } => {
        if (event.is_all_day) {
          // For all-day events, use the date as-is without timezone conversion
          // since all-day events should represent the same calendar date regardless of timezone
          const utcDate = dayjs.utc(isoString);
          return {
            date: utcDate.toDate(),
            time: "09:00" // Default time for all-day events
          };
        } else {
          // For timed events, convert UTC datetime to user's timezone
          const utcDatetime = dayjs.utc(isoString);
          const localDatetime = utcDatetime.tz(userTimezone);
          
          return {
            date: localDatetime.toDate(),
            time: localDatetime.format("HH:mm")
          };
        }
      }

      const start = extractDateAndTime(event.start_at)
      const end = extractDateAndTime(event.end_at)
      
      setEditFormData({
        title: event.title || "",
        description: event.description || "",
        start_date: start.date,
        start_time: timeStringToHour(start.time || "09:00"),
        end_date: end.date,
        end_time: timeStringToHour(end.time || "10:00"),
        location: event.location || "",
        is_all_day: event.is_all_day || false,
        requires_confirmation: event.requires_confirmation || true,
        color: (event.color?.toLowerCase() || "red") as string,
        status: (event.status || "active") as EventStatus,
        selected_attendees: event.attendees?.map(a => a.user_id).filter(Boolean) || [],
      })
    }
  }, [event, isEditing])

  const loadWorkspaceMembers = useCallback(async () => {
    if (!wsId) return
    
    setMembersLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("workspace_members")
        .select(`
          user_id,
          users!workspace_members_user_id_fkey (
            id,
            display_name,
            avatar_url
          )
        `)
        .eq("ws_id", wsId)

      if (error) throw error

      const members: WorkspaceMember[] = (data || [])
        .map((member: { user_id: string; users: { display_name: string | null; avatar_url: string | null } | null }) => ({
          user_id: member.user_id,
          display_name: member.users?.display_name || null,
          email: null, // Email not available from this query
          avatar_url: member.users?.avatar_url || null,
        }))
        .filter((member) => member.user_id)

      setWorkspaceMembers(members)
    } catch (error) {
      console.error("Error loading workspace members:", error)
      toast.error("Failed to load workspace members")
    } finally {
      setMembersLoading(false)
    }
  }, [wsId])

  // Load workspace members when editing
  useEffect(() => {
    if (isEditing && workspaceMembers.length === 0) {
      loadWorkspaceMembers()
    }
  }, [isEditing, workspaceMembers.length, loadWorkspaceMembers])

  const handleInputChange = useCallback((field: keyof EventFormData, value: string | boolean | Date | number | undefined) => {
    setEditFormData((prev) => ({ ...prev, [field]: value }))
  }, [])

  const toggleAttendee = useCallback(
    (memberId: string) => {
      if (memberId === currentUserId) {
        toast.info("As the event creator, you are automatically included in the event.")
        return
      }
      
      setEditFormData((prev) => ({
        ...prev,
        selected_attendees: prev.selected_attendees.includes(memberId)
          ? prev.selected_attendees.filter((id) => id !== memberId)
          : [...prev.selected_attendees, memberId],
      }))
    },
    [currentUserId]
  )

  const handleSaveEdit = useCallback(async () => {
    if (!event || !editFormData.title.trim()) {
      toast.error("Event title is required")
      return
    }

    if (!editFormData.start_date || !editFormData.end_date) {
      toast.error("Start and end dates are required")
      return
    }

    setIsSaving(true)
    try {
      // Get user's timezone
      const userTimezone = getUserTimezone();

      let start_at: string;
      let end_at: string;

      if (editFormData.is_all_day) {
        // For all-day events, use start of day in user's timezone
        const startOfDay = dayjs.tz(editFormData.start_date, userTimezone).startOf('day');
        const endOfDay = dayjs.tz(editFormData.end_date, userTimezone).endOf('day');
        
        start_at = startOfDay.utc().toISOString();
        end_at = endOfDay.utc().toISOString();
      } else {
        // For timed events, create datetime in user's timezone then convert to UTC
        start_at = createDateTimeInTimezone(
          editFormData.start_date,
          hourToTimeString(editFormData.start_time),
          userTimezone
        );
        end_at = createDateTimeInTimezone(
          editFormData.end_date,
          hourToTimeString(editFormData.end_time),
          userTimezone
        );
      }

      const updatePayload = {
        title: editFormData.title.trim(),
        description: editFormData.description.trim() || null,
        start_at,
        end_at,
        location: editFormData.location.trim() || null,
        color: editFormData.color.toUpperCase(),
        is_all_day: editFormData.is_all_day,
        status: editFormData.status,
      }

      const response = await fetch(`/api/v1/workspaces/${wsId}/scheduled-events/${event.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatePayload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update event")
      }

      // Update attendees if they changed
      const currentAttendeeIds = new Set(event.attendees?.map(a => a.user_id).filter(Boolean) || [])
      const newAttendeeIds = new Set(editFormData.selected_attendees)
      
      if (currentAttendeeIds.size !== newAttendeeIds.size || 
          [...currentAttendeeIds].some(id => !newAttendeeIds.has(id))) {
        // Attendees have changed, need to update them
        const attendeesToAdd = [...newAttendeeIds].filter(id => !currentAttendeeIds.has(id))
        const attendeesToRemove = [...currentAttendeeIds].filter(id => !newAttendeeIds.has(id))

        // Add new attendees
        if (attendeesToAdd.length > 0) {
          const addResponse = await fetch(`/api/v1/workspaces/${wsId}/scheduled-events/${event.id}/attendees`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ user_ids: attendeesToAdd }),
          })

          if (!addResponse.ok) {
            console.error("Failed to add attendees")
          }
        }

        // Remove attendees
        for (const userId of attendeesToRemove) {
          await fetch(`/api/v1/workspaces/${wsId}/scheduled-events/${event.id}/attendees/${userId}`, {
            method: "DELETE",
          })
        }
      }

      toast.success("Event updated successfully!")
      setIsEditing(false)
      onEventUpdate?.(event.id)
      
      // Refresh the event data
    } catch (error) {
      console.error("Error updating event:", error)
      toast.error("Failed to update event. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }, [wsId, event, editFormData, onEventUpdate])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setEditFormData({
      title: "",
      description: "",
      start_date: undefined,
      start_time: 9, // 9 AM
      end_date: undefined,
      end_time: 10, // 10 AM
      location: "",
      is_all_day: false,
      requires_confirmation: true,
      color: "red",
      status: "active",
      selected_attendees: [],
    })
  }, [])

  // Determine user's role in this event
  const isCreator = !userLoading && currentUserId && event?.creator_id === currentUserId
  const userAttendee = event?.attendees?.find((attendee) => attendee.user_id === currentUserId)
  const isAttendee = !!userAttendee

  const handleUpdateAttendeeStatus = useCallback(
    async (status: "accepted" | "declined" | "tentative") => {
      if (!event || !currentUserId || isUpdatingStatus) return

      setIsUpdatingStatus(true)
      try {
        const response = await fetch(`/api/v1/workspaces/${wsId}/scheduled-events/${event.id}/attendees/respond`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        })

        if (!response.ok) {
          throw new Error("Failed to update attendance status")
        }

        toast.success(`Marked as ${STATUS_CONFIG[status].label.toLowerCase()}`)

        // Refresh the event data
        window.location.reload()
      } catch (error) {
        console.error("Error updating attendance status:", error)
        toast.error("Failed to update attendance status. Please try again.")
      } finally {
        setIsUpdatingStatus(false)
      }
    },
    [wsId, event, currentUserId, isUpdatingStatus],
  )

  const handleDeleteEvent = useCallback(async () => {
    if (!event || !confirm("Are you sure you want to delete this event? This action cannot be undone.")) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/v1/workspaces/${wsId}/scheduled-events/${event.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete event")
      }

      toast.success("Event deleted successfully")
      onEventDelete?.(event.id)
      onClose()
    } catch (error) {
      console.error("Error deleting event:", error)
      toast.error("Failed to delete event. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }, [wsId, onEventDelete, onClose, event])

  const handleResendInvitations = useCallback(async () => {
    toast.info("Resend invitations feature coming soon")
  }, [])

  const formatEventTime = useCallback((event: WorkspaceScheduledEventWithAttendees) => {
    if (event.is_all_day) {
      const startDate = new Date(event.start_at)
      const endDate = new Date(event.end_at)

      if (format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) {
        return {
          date: format(startDate, "EEEE, MMMM d, yyyy"),
          time: "All day",
        }
      } else {
        return {
          date: `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`,
          time: "All day",
        }
      }
    } else {
      const startDate = new Date(event.start_at)
      const endDate = new Date(event.end_at)
      return {
        date: format(startDate, "EEEE, MMMM d, yyyy"),
        time: `${format(startDate, "h:mm a")} - ${format(endDate, "h:mm a")}`,
      }
    }
  }, [])

  const getStatusStats = useCallback(() => {
    if (!event?.attendee_count) return null

    const { total, accepted, declined, pending, tentative } = event.attendee_count
    return {
      total,
      accepted,
      declined,
      pending,
      tentative,
      responseRate: total > 0 ? Math.round(((accepted + declined + tentative) / total) * 100) : 0,
    }
  }, [event?.attendee_count])

  const stats = getStatusStats()
  const eventTime = event ? formatEventTime(event) : null

  if (isLoading || userLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] max-w-2xl">
          <DialogTitle>Loading...</DialogTitle>
          <div className="flex items-center justify-center p-12">
            <div className="text-center space-y-4">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-muted-foreground">Loading event details...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!event) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <div className="flex flex-col h-full">
          {/* Header Section */}
          <DialogHeader className="space-y-6 pb-6">
            <div className="space-y-4">
              <DialogTitle className="text-2xl font-bold leading-tight pr-8">{event.title}</DialogTitle>

              {/* Event Time & Location */}
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <CalendarIcon className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium">{eventTime?.date}</div>
                    <div className="text-sm text-muted-foreground">{eventTime?.time}</div>
                  </div>
                </div>

                {event.location && (
                  <div className="flex items-start space-x-3">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="font-medium">{event.location}</div>
                  </div>
                )}
              </div>

              {/* Creator Info */}
              {event.creator && (
                <div className="flex items-center space-x-3 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span>
                    Created by {event.creator.display_name || "Unknown"}
                    {isCreator && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        You
                      </Badge>
                    )}
                  </span>
                  <span>•</span>
                  <span>{format(new Date(event.created_at || ""), "MMM d, yyyy")}</span>
                </div>
              )}
            </div>

            {/* RSVP Actions - More Prominent */}
            {isAttendee && (
              <div className="bg-muted/30 rounded-lg p-4 space-y-4">
                <div className="text-sm font-medium text-center">
                  {userAttendee?.status === "pending" ? "Please respond to this invitation" : "Your Response"}
                </div>

                {userAttendee?.status === "pending" ? (
                  <div className="flex space-x-2">
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleUpdateAttendeeStatus("accepted")}
                      disabled={isUpdatingStatus}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Going
                    </Button>
                    <Button
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => handleUpdateAttendeeStatus("tentative")}
                      disabled={isUpdatingStatus}
                    >
                      <HelpCircle className="mr-2 h-4 w-4" />
                      Maybe
                    </Button>
                    <Button
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => handleUpdateAttendeeStatus("declined")}
                      disabled={isUpdatingStatus}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Can&apos;t Go
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <Badge className={cn("px-3 py-1 text-sm", STATUS_CONFIG[userAttendee?.status || "pending"].color)}>
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full mr-2",
                          STATUS_CONFIG[userAttendee?.status || "pending"].dotColor,
                        )}
                      />
                      {STATUS_CONFIG[userAttendee?.status || "pending"].label}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleUpdateAttendeeStatus(userAttendee?.status === "accepted" ? "declined" : "accepted")
                      }
                      disabled={isUpdatingStatus}
                    >
                      Change Response
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Creator Actions */}
            {isCreator && (
              <div className="flex items-center justify-end space-x-2">
                {isEditing ? (
                  <>
                    <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveEdit} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Event
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleResendInvitations}>
                      <Mail className="mr-2 h-4 w-4" />
                      Resend
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeleteEvent}
                      disabled={isDeleting}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 bg-transparent"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {isDeleting ? "Deleting..." : "Delete"}
                    </Button>
                  </>
                )}
              </div>
            )}
          </DialogHeader>

          {/* Description or Edit Form */}
          {isEditing ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Edit className="h-4 w-4" />
                <span>Editing Event</span>
                {isSaving && (
                  <>
                    <span>•</span>
                    <div className="flex items-center space-x-1">
                      <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                      <span>Saving changes...</span>
                    </div>
                  </>
                )}
              </div>
              <EditEventForm
                formData={editFormData}
                workspaceMembers={workspaceMembers}
                membersLoading={membersLoading}
                currentUserId={currentUserId}
                onInputChange={handleInputChange}
                onToggleAttendee={toggleAttendee}
                startDateOpen={startDateOpen}
                endDateOpen={endDateOpen}
                setStartDateOpen={setStartDateOpen}
                setEndDateOpen={setEndDateOpen}
              />
            </div>
          ) : (
            event.description && (
              <div className="pb-6">
                <p className="text-muted-foreground leading-relaxed">{event.description}</p>
              </div>
            )
          )}

          <Separator />
{isEditing ? null : (
<>
          {/* Response Statistics */}
          {stats && (
            <div className="py-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center">
                  <Users className="mr-2 h-5 w-5" />
                  Responses ({stats.total} invited)
                </h3>
                <Badge variant="outline" className="text-sm">
                  {stats.responseRate}% responded
                </Badge>
              </div>

              {/* Visual Progress Bar */}
              <div className="space-y-3">
                <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                  {stats.accepted > 0 && (
                    <div className="bg-emerald-500" style={{ width: `${(stats.accepted / stats.total) * 100}%` }} />
                  )}
                  {stats.tentative > 0 && (
                    <div className="bg-blue-500" style={{ width: `${(stats.tentative / stats.total) * 100}%` }} />
                  )}
                  {stats.declined > 0 && (
                    <div className="bg-red-500" style={{ width: `${(stats.declined / stats.total) * 100}%` }} />
                  )}
                </div>

                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">Going</span>
                    <span className="font-medium">{stats.accepted}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-muted-foreground">Maybe</span>
                    <span className="font-medium">{stats.tentative}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-muted-foreground">Can&apos;t Go</span>
                    <span className="font-medium">{stats.declined}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-medium">{stats.pending}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Attendees Section */}
          <div className="flex-1 py-6 min-h-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Attendees</h3>
              <div className="flex items-center space-x-2">
                {isCreator && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="text-primary hover:text-primary"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    {isEditing ? "Currently Editing" : "Manage Attendees"}
                  </Button>
                )}
                {(event.attendees?.length || 0) > 6 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllAttendees(!showAllAttendees)}
                    className="text-sm"
                  >
                    {showAllAttendees ? "Show Less" : "Show All"}
                    <ChevronDown className={cn("ml-1 h-4 w-4 transition-transform", showAllAttendees && "rotate-180")} />
                  </Button>
                )}
              </div>
            </div>


            <EnhancedAttendeesList
              attendees={event.attendees || []}
              isCreator={!!isCreator}
              showAll={showAllAttendees}
            />
          </div>
          </>
)}

        </div>
      </DialogContent>
    </Dialog>
  )
}

// Enhanced Attendees List Component
function EnhancedAttendeesList({
  attendees,
  isCreator = false,
  showAll = false,
}: {
  attendees: EventAttendeeWithUser[]
  isCreator?: boolean
  showAll?: boolean
}) {
  const [activeTab, setActiveTab] = useState<EventAttendeeStatus | "all">("all")

  const filteredAttendees = activeTab === "all" ? attendees : attendees.filter((a) => a.status === activeTab)

  const displayAttendees = showAll ? filteredAttendees : filteredAttendees.slice(0, 6)

  const getStatusCounts = () => {
    return {
      all: attendees.length,
      accepted: attendees.filter((a) => a.status === "accepted").length,
      tentative: attendees.filter((a) => a.status === "tentative").length,
      declined: attendees.filter((a) => a.status === "declined").length,
      pending: attendees.filter((a) => a.status === "pending").length,
    }
  }

  const counts = getStatusCounts()

  if (attendees.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
        <p>No attendees yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex space-x-1 bg-muted p-1 rounded-lg">
        <button
          onClick={() => setActiveTab("all")}
          className={cn(
            "flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "all"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          All ({counts.all})
        </button>
        <button
          onClick={() => setActiveTab("accepted")}
          className={cn(
            "flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "accepted"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Going ({counts.accepted})
        </button>
        <button
          onClick={() => setActiveTab("tentative")}
          className={cn(
            "flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "tentative"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Maybe ({counts.tentative})
        </button>
        <button
          onClick={() => setActiveTab("pending")}
          className={cn(
            "flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "pending"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Pending ({counts.pending})
        </button>
      </div>

      {/* Attendees List */}


      {filteredAttendees.length === 0 && activeTab !== "all" ?(
        <div className="py-8 text-center text-muted-foreground">
          <p>No attendees in this category</p>
        </div>
      ) :       <ScrollArea className="h-64">
        <div className="space-y-2">
          {displayAttendees.map((attendee) => (
            <div
              key={attendee.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={attendee.user?.avatar_url || ""} />
                  <AvatarFallback className="bg-muted">
                    {attendee.user?.display_name?.charAt(0)?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{attendee.user?.display_name || "Unknown User"}</div>
                  {isCreator && attendee.response_at && (
                    <div className="text-xs text-muted-foreground">
                      Responded {format(new Date(attendee.response_at), "MMM d, h:mm a")}
                    </div>
                  )}
                </div>
              </div>

              <Badge className={cn("px-2 py-1 text-xs font-medium", STATUS_CONFIG[attendee.status].color)}>
                <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5", STATUS_CONFIG[attendee.status].dotColor)} />
                {STATUS_CONFIG[attendee.status].label}
              </Badge>
            </div>
          ))}
        </div>
      </ScrollArea>
      }
    </div>
  )
}

// Edit Event Form Component
interface EditEventFormProps {
  formData: EventFormData
  workspaceMembers: WorkspaceMember[]
  membersLoading: boolean
  currentUserId: string | null
  onInputChange: (field: keyof EventFormData, value: string | boolean | Date | number | undefined) => void
  onToggleAttendee: (memberId: string) => void
  startDateOpen: boolean
  endDateOpen: boolean
  setStartDateOpen: (open: boolean) => void
  setEndDateOpen: (open: boolean) => void
}

function EditEventForm({
  formData,
  workspaceMembers,
  membersLoading,
  currentUserId,
  onInputChange,
  onToggleAttendee,
  startDateOpen,
  endDateOpen,
  setStartDateOpen,
  setEndDateOpen,
}: EditEventFormProps) {
  return (
    <div className="space-y-6 pb-6">
      {/* Basic Information */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="title">Event Title *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => onInputChange("title", e.target.value)}
            placeholder="Enter event title"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => onInputChange("description", e.target.value)}
            placeholder="Enter event description"
            rows={3}
            className="mt-1"
          />
        </div>
      </div>

      {/* Date and Time */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="is_all_day"
            checked={formData.is_all_day}
            onCheckedChange={(checked) => onInputChange("is_all_day", checked)}
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
                    "w-full justify-start text-left font-normal mt-1",
                    !formData.start_date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.start_date ? format(formData.start_date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.start_date}
                  onSelect={(date) => {
                    onInputChange("start_date", date)
                    if (!formData.end_date && date) {
                      onInputChange("end_date", date)
                    }
                    setStartDateOpen(false)
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
              <TimeSelector
                value={formData.start_time}
                onValueChange={(value) => onInputChange("start_time", value)}
                disabledTime={formData.end_time}
                isStartTime={true}
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
                    "w-full justify-start text-left font-normal mt-1",
                    !formData.end_date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.end_date ? format(formData.end_date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.end_date}
                  onSelect={(date) => {
                    onInputChange("end_date", date)
                    setEndDateOpen(false)
                  }}
                  disabled={(date) => (formData.start_date ? date < formData.start_date : false)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* End Time */}
          {!formData.is_all_day && (
            <div>
              <Label>End Time *</Label>
              <TimeSelector
                value={formData.end_time}
                onValueChange={(value) => onInputChange("end_time", value)}
                disabledTime={formData.start_time}
                isStartTime={false}
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
            onChange={(e) => onInputChange("location", e.target.value)}
            placeholder="Enter location"
            className="mt-1"
          />
        </div>

        <div>
          <Label>Event Color</Label>
          <Select value={formData.color} onValueChange={(value) => onInputChange("color", value)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_COLORS.map((color) => (
                <SelectItem key={color.value} value={color.value}>
                  <div className="flex items-center space-x-2">
                    <div className={cn("h-4 w-4 rounded-full", color.color)} />
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
            onCheckedChange={(checked) => onInputChange("requires_confirmation", checked)}
          />
          <Label htmlFor="requires_confirmation">
            Require attendee confirmation (attendees must vote to accept/decline)
          </Label>
        </div>
      </div>

      {/* Attendee Selection */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Users className="h-4 w-4" />
          <Label>Select Attendees *</Label>
          {formData.selected_attendees.length > 0 && (
            <Badge variant="secondary">{formData.selected_attendees.length} selected</Badge>
          )}
        </div>

        <ScrollArea className="h-48 rounded-md border p-4">
          {membersLoading ? (
            <div className="text-center text-muted-foreground">Loading members...</div>
          ) : workspaceMembers.length === 0 ? (
            <div className="text-center text-muted-foreground">No members found</div>
          ) : (
            <div className="space-y-2">
              {workspaceMembers.map((member) => {
                const isCurrentUser = member.user_id === currentUserId
                const isChecked = formData.selected_attendees.includes(member.user_id)

                return (
                  <div
                    key={member.user_id}
                    className={cn(
                      "flex items-center space-x-3 rounded-md p-2",
                      !isCurrentUser && "cursor-pointer hover:bg-muted",
                      isCurrentUser && "bg-muted/50"
                    )}
                    onClick={() => !isCurrentUser && onToggleAttendee(member.user_id)}
                  >
                    <Checkbox
                      checked={isChecked}
                      disabled={isCurrentUser}
                      onChange={() => !isCurrentUser && onToggleAttendee(member.user_id)}
                    />
                    <div className="flex-1">
                      <div className={cn("font-medium", isCurrentUser && "text-primary")}>
                        {member.display_name || "Unknown User"}
                        {isCurrentUser && " (You - Event Creator)"}
                      </div>
                      {member.email && (
                        <div className="text-sm text-muted-foreground">
                          {member.email}
                          {isCurrentUser && " • Automatically included"}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
