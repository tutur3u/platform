---
title: Smart Scheduling Overview
description: Intelligent, unified scheduling for habits and tasks with priority-aware event placement
updatedAt: 2026-06-21
audience: users
---

# Smart Scheduling:anchor{#smart-scheduling}

Smart Scheduling is an intelligent system that automatically schedules your habits and tasks on your calendar, respecting priorities, deadlines, and your preferences.

## Key Features:anchor{#key-features}

```cards
cols: 2
cards:
  - title: Unified Scheduling
    icon: calendar-check
    body: |
      Habits and tasks are scheduled together in a coordinated manner, ensuring they don't conflict
  - title: Priority-Aware
    icon: arrow-up-1-9
    body: |
      Items are scheduled based on priority, with urgent tasks able to bump lower-priority habits
  - title: Deadline Intelligence
    icon: clock
    body: |
      Automatically infers priority from deadlines - items due soon get scheduled first
  - title: Flexible Duration
    icon: arrows-left-right
    body: |
      Habits can have min/max duration bounds, optimizing time based on slot availability
```

## How It Works:anchor{#how-it-works}

### 1. Priority Calculation:anchor{#1-priority-calculation}

Every habit and task has an **effective priority** that determines scheduling order:

| Priority | Weight | Deadline Inference             |
| -------- | ------ | ------------------------------ |
| Critical | 4      | Overdue or due within 24 hours |
| High     | 3      | Due within 24-48 hours         |
| Normal   | 2      | Due beyond 48 hours            |
| Low      | 1      | No deadline set                |

> [!NOTE]
>
> Explicit priorities always take precedence over inferred priorities. If you manually set a task as "Critical", it stays critical regardless of deadline.

### 2. Scheduling Order:anchor{#2-scheduling-order}

Smart Scheduling processes items in this order:

1. **Habits First** - Sorted by priority, then by ideal time preference

2. **Tasks Second** - Sorted by priority, then by deadline proximity

3. **Bumping** - Urgent (critical) tasks can bump lower-priority habit events

4. **Rescheduling** - Bumped habits are rescheduled to the next available slot

### 3. Duration Optimization:anchor{#3-duration-optimization}

For habits with flexible duration (min/max bounds), the system optimizes duration based on slot characteristics:

```
Ideal Time Match → Maximum duration (get most value from preferred time)
Preference Match → Preferred duration (morning/afternoon/evening/night)
Constrained Slot → Minimum viable duration (still complete the habit)
No Match → Preferred duration (default behavior)
```

## Using Smart Schedule:anchor{#using-smart-schedule}

### From the Calendar:anchor{#from-the-calendar}

Click the **Smart Schedule** button in the calendar toolbar to run scheduling for your workspace:

1. **Click Smart Schedule**

   Find the button in the calendar toolbar with the sparkle icon

2. **Wait for Processing**

   The system analyzes your habits, tasks, and existing events

3. **View Results**

   New calendar events appear automatically, with a toast notification showing the summary

### Automatic Scheduling:anchor{#automatic-scheduling}

Smart Scheduling runs automatically every 6 hours via a background cron job (`/api/cron/calendar/smart-schedule`, scheduled `0 */6 * * *`). This keeps your calendar up to date as you add new habits and tasks. You can always trigger an on-demand run from the calendar toolbar in between cron cycles.

> [!INFO]
>
> The cron job only schedules items with `auto_schedule` enabled. You can enable/disable auto-scheduling per habit or task.
