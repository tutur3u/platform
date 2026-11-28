---
title: API Reference
description: REST API endpoints for Smart Scheduling
updatedAt: 2026-06-21
audience: developers
---

# Smart Scheduling API:anchor{#smart-scheduling-api}

The Smart Scheduling API allows you to programmatically trigger scheduling and retrieve scheduling status.

## Endpoints:anchor{#endpoints}

### Trigger Scheduling:anchor{#trigger-scheduling}

```http
POST /api/v1/workspaces/{wsId}/calendar/schedule
```

Triggers the unified scheduler for a workspace, scheduling both habits and tasks.

#### Path Parameters:anchor{#path-parameters}

| Name       | Type   | Required | Default | Description                    |
| ---------- | ------ | -------- | ------- | ------------------------------ |
| path: wsId | string | Yes      |         | The workspace ID (UUID format) |

#### Request Body:anchor{#request-body}

| Name             | Type   | Required | Default | Description                                             |
| ---------------- | ------ | -------- | ------- | ------------------------------------------------------- |
| body: windowDays | number | No       | 30      | How many days into the future to schedule events (7-90) |

| Name                  | Type    | Required | Default | Description                                                          |
| --------------------- | ------- | -------- | ------- | -------------------------------------------------------------------- |
| body: forceReschedule | boolean | No       | false   | If true, deletes existing auto-generated events and creates new ones |
