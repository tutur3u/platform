'use client';

import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  MapPin,
  Plus,
  Users,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { motion } from 'framer-motion';
import { useState } from 'react';

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState('month');

  // Calendar data
  const events = [
    {
      id: 1,
      title: 'Family Dinner',
      date: new Date(2023, 10, 18, 19, 0),
      location: 'Golden Dragon Restaurant',
      attendees: [
        { id: 1, initial: 'D', color: 'blue' },
        { id: 2, initial: 'L', color: 'green' },
        { id: 3, initial: 'M', color: 'purple' },
        { id: 4, initial: 'S', color: 'pink' },
      ],
      color: 'blue',
    },
    {
      id: 2,
      title: 'Movie Afternoon',
      date: new Date(2023, 10, 19, 14, 0),
      location: 'Galaxy Cinema',
      attendees: [
        { id: 3, initial: 'M', color: 'purple' },
        { id: 4, initial: 'S', color: 'pink' },
      ],
      color: 'pink',
    },
    {
      id: 3,
      title: 'Grandparents Visit',
      date: new Date(2023, 10, 25, 10, 0),
      endDate: new Date(2023, 10, 26, 18, 0),
      location: 'Home',
      attendees: [
        { id: 1, initial: 'D', color: 'blue' },
        { id: 2, initial: 'L', color: 'green' },
        { id: 3, initial: 'M', color: 'purple' },
        { id: 4, initial: 'S', color: 'pink' },
        { id: 5, initial: 'G', color: 'orange' },
        { id: 6, initial: 'G', color: 'orange' },
      ],
      color: 'green',
    },
    {
      id: 4,
      title: 'Parent-Teacher Conference',
      date: new Date(2023, 10, 22, 15, 30),
      location: 'School',
      attendees: [
        { id: 2, initial: 'L', color: 'green' },
        { id: 3, initial: 'M', color: 'purple' },
      ],
      color: 'purple',
    },
  ];

  // Helper functions for calendar
  const daysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();

  const firstDayOfMonth = (year: number, month: number) =>
    new Date(year, month, 1).getDay();

  const formatMonth = (date: Date) => {
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const prevMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
    );
  };

  const nextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
    );
  };

  const isToday = (year: number, month: number, day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear()
    );
  };

  const getEventsForDate = (year: number, month: number, day: number) => {
    return events.filter((event) => {
      const eventDate = new Date(event.date);
      return (
        day === eventDate.getDate() &&
        month === eventDate.getMonth() &&
        year === eventDate.getFullYear()
      );
    });
  };

  const getEventColor = (color: string) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400';
      case 'green':
        return 'bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-400';
      case 'purple':
        return 'bg-purple-500/20 text-purple-600 dark:bg-purple-500/30 dark:text-purple-400';
      case 'pink':
        return 'bg-pink-500/20 text-pink-600 dark:bg-pink-500/30 dark:text-pink-400';
      case 'orange':
        return 'bg-orange-500/20 text-orange-600 dark:bg-orange-500/30 dark:text-orange-400';
      default:
        return 'bg-gray-500/20 text-muted-foreground dark:bg-gray-500/30 dark:text-gray-400';
    }
  };

  // Generate calendar grid
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const totalDays = daysInMonth(year, month);
  const firstDay = firstDayOfMonth(year, month);

  // Create an array of day numbers including empty days for proper grid alignment
  const days = Array.from(
    { length: firstDay },
    () => null as null | number
  ).concat(Array.from({ length: totalDays }, (_, i) => i + 1));

  // Ensure we have complete weeks by adding empty days at the end if needed
  while (days.length % 7 !== 0) {
    days.push(null);
  }

  // Split days into weeks for better rendering
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  // Filter events for the selected date
  const selectedDateEvents = getEventsForDate(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate()
  );

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-linear-to-r flex h-10 w-10 items-center justify-center rounded-full from-blue-500/80 to-purple-500/80">
            <CalendarIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Family Calendar</h1>
            <p className="text-muted-foreground text-sm">
              Plan and coordinate family activities
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="bg-linear-to-r from-blue-600 to-purple-600 text-white"
        >
          <Plus className="mr-1 h-4 w-4" /> New Event
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 overflow-hidden backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-2xl font-bold">
                  {formatMonth(currentMonth)}
                </div>
                <div className="flex gap-1">
                  <Button
                    onClick={prevMonth}
                    size="icon"
                    variant="outline"
                    className="border-foreground/10 dark:border-foreground/5 h-7 w-7 rounded-full"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={nextMonth}
                    size="icon"
                    variant="outline"
                    className="border-foreground/10 dark:border-foreground/5 h-7 w-7 rounded-full"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={view} onValueChange={(value) => setView(value)}>
                  <SelectTrigger className="border-foreground/10 dark:border-foreground/5 h-8 w-[110px] text-xs">
                    <SelectValue placeholder="View" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="day">Day</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-foreground/10 dark:border-foreground/5 h-8 text-xs"
                  onClick={() => setCurrentMonth(new Date())}
                >
                  Today
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {/* Calendar Grid */}
              <div className="relative">
                {/* Decorative elements */}
                <div className="absolute -right-20 top-10 h-60 w-60 rounded-full bg-purple-500/5 blur-3xl dark:bg-purple-500/10"></div>
                <div className="absolute -left-20 bottom-10 h-60 w-60 rounded-full bg-blue-500/5 blur-3xl dark:bg-blue-500/10"></div>

                <div className="border-foreground/10 dark:border-foreground/5 relative grid grid-cols-7 border-b">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                    (day, i) => (
                      <div
                        key={i}
                        className="text-muted-foreground py-2 text-center text-sm font-medium"
                      >
                        {day}
                      </div>
                    )
                  )}
                </div>
                <div className="grid grid-cols-7">
                  {weeks.flat().map((day, i) => (
                    <motion.div
                      key={i}
                      whileHover={day ? { scale: 1.02 } : {}}
                      whileTap={day ? { scale: 0.98 } : {}}
                      onClick={() =>
                        day && setSelectedDate(new Date(year, month, day))
                      }
                      className={`border-foreground/10 dark:border-foreground/5 relative h-24 border-b border-r p-1 ${
                        !day ? 'bg-foreground/5 dark:bg-foreground/[0.01]' : ''
                      } ${
                        day && isToday(year, month, day)
                          ? 'bg-blue-500/5 dark:bg-blue-500/10'
                          : ''
                      } ${
                        day &&
                        isSameDay(selectedDate, new Date(year, month, day))
                          ? 'bg-purple-500/10 dark:bg-purple-500/20'
                          : ''
                      }`}
                    >
                      {day && (
                        <>
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                              isToday(year, month, day)
                                ? 'bg-blue-500 text-white'
                                : ''
                            }`}
                          >
                            {day}
                          </div>
                          <div className="mt-1 flex max-h-[60px] flex-col gap-1 overflow-hidden">
                            {getEventsForDate(year, month, day).map((event) => (
                              <div
                                key={event.id}
                                className={`truncate rounded px-1 py-0.5 text-xs ${getEventColor(
                                  event.color
                                )}`}
                              >
                                {event.title}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Selected Day Events */}
          {selectedDateEvents.length > 0 && (
            <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg">
                  Events for{' '}
                  {selectedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedDateEvents.map((event) => (
                    <div
                      key={event.id}
                      className={`border-foreground/10 dark:border-foreground/5 rounded-lg border p-4 ${
                        event.color === 'blue'
                          ? 'bg-blue-500/5 dark:bg-blue-500/10'
                          : event.color === 'green'
                            ? 'bg-green-500/5 dark:bg-green-500/10'
                            : event.color === 'purple'
                              ? 'bg-purple-500/5 dark:bg-purple-500/10'
                              : event.color === 'pink'
                                ? 'bg-pink-500/5 dark:bg-pink-500/10'
                                : 'bg-orange-500/5 dark:bg-orange-500/10'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="font-semibold">{event.title}</h3>
                        <Badge className={getEventColor(event.color)}>
                          {event.endDate ? 'Multi-day' : 'Event'}
                        </Badge>
                      </div>
                      <div className="grid gap-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="text-muted-foreground h-4 w-4" />
                          <span>
                            {event.date.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {event.endDate
                              ? ` - ${event.endDate.toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                })}`
                              : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="text-muted-foreground h-4 w-4" />
                          <span>{event.location}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="text-muted-foreground h-4 w-4" />
                          <div className="flex -space-x-2">
                            {event.attendees.slice(0, 4).map((attendee) => (
                              <Avatar
                                key={attendee.id}
                                className="border-background h-6 w-6 border-2"
                              >
                                <AvatarFallback
                                  className={`text-xs ${
                                    attendee.color === 'blue'
                                      ? 'bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400'
                                      : attendee.color === 'green'
                                        ? 'bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-400'
                                        : attendee.color === 'purple'
                                          ? 'bg-purple-500/20 text-purple-600 dark:bg-purple-500/30 dark:text-purple-400'
                                          : attendee.color === 'pink'
                                            ? 'bg-pink-500/20 text-pink-600 dark:bg-pink-500/30 dark:text-pink-400'
                                            : 'bg-orange-500/20 text-orange-600 dark:bg-orange-500/30 dark:text-orange-400'
                                  }`}
                                >
                                  {attendee.initial}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                            {event.attendees.length > 4 && (
                              <Avatar className="border-background h-6 w-6 border-2">
                                <AvatarFallback className="bg-foreground/10 text-xs">
                                  +{event.attendees.length - 4}
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {/* Family Members Schedule */}
          <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 backdrop-blur-sm">
            <CardHeader className="bg-linear-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20">
              <CardTitle className="text-base">Family Members</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[230px]">
                <div className="p-4">
                  {[
                    {
                      id: 1,
                      name: 'Duc (Dad)',
                      initial: 'D',
                      color: 'blue',
                      status: 'Busy today',
                    },
                    {
                      id: 2,
                      name: 'Linh (Mom)',
                      initial: 'L',
                      color: 'green',
                      status: 'Available after 5pm',
                    },
                    {
                      id: 3,
                      name: 'Minh (Son)',
                      initial: 'M',
                      color: 'purple',
                      status: 'School until 3pm',
                    },
                    {
                      id: 4,
                      name: 'Suong (Daughter)',
                      initial: 'S',
                      color: 'pink',
                      status: 'Piano lesson at 4pm',
                    },
                  ].map((member) => (
                    <div
                      key={member.id}
                      className="mb-4 flex items-start gap-2"
                    >
                      <Avatar
                        className={`h-8 w-8 ${getEventColor(member.color)}`}
                      >
                        <AvatarFallback>{member.initial}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {member.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Upcoming Events */}
          <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 backdrop-blur-sm">
            <CardHeader className="bg-linear-to-r from-pink-500/10 to-orange-500/10 dark:from-pink-500/20 dark:to-orange-500/20">
              <CardTitle className="text-base">Upcoming Events</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                {events.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    className="border-foreground/10 dark:border-foreground/5 rounded-lg border p-3"
                  >
                    <div className="flex justify-between">
                      <Badge className={getEventColor(event.color)}>
                        {event.date.toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Badge>
                      <span className="text-xs font-medium">
                        {event.date.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <h4 className="mt-1 text-sm font-medium">{event.title}</h4>
                    <p className="text-muted-foreground text-xs">
                      {event.location}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 backdrop-blur-sm">
            <CardHeader className="bg-linear-to-r from-green-500/10 to-teal-500/10 dark:from-green-500/20 dark:to-teal-500/20">
              <CardTitle className="text-base">Scheduling Tips</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <Info className="text-muted-foreground mt-0.5 h-4 w-4" />
                <p className="text-muted-foreground text-xs">
                  Famigo can automatically suggest the best times for family
                  activities based on everyone's schedule.
                </p>
              </div>
              <Separator className="bg-foreground/5 my-2" />
              <Button
                size="sm"
                variant="outline"
                className="mt-1 w-full text-xs"
              >
                Find Free Time Slots
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
