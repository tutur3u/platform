export const timeTrackingSelect = `
        id,
        display_number,
        name,
        priority,
        start_date,
        end_date,
        list_id,
        task_lists!inner (
          id,
          name,
          status,
          color,
          deleted,
          board_id,
          workspace_boards!inner (
            id,
            name,
            ticket_prefix,
            ws_id,
            workspaces!inner (
              id,
              name,
              personal
            )
          )
        ),
        assignees:task_assignees(
          user_id
        )
      `;

export const timeTrackingSelectAssignedToMe = `
        id,
        display_number,
        name,
        priority,
        start_date,
        end_date,
        list_id,
        task_lists!inner (
          id,
          name,
          status,
          color,
          deleted,
          board_id,
          workspace_boards!inner (
            id,
            name,
            ticket_prefix,
            ws_id,
            workspaces!inner (
              id,
              name,
              personal
            )
          )
        ),
        _currentUserAssignment:task_assignees!inner(
          user_id
        ),
        assignees:task_assignees(
          user_id
        )
      `;

export const fullSelect = `
        id,
        display_number,
        name,
        description,
        priority,
        completed,
        completed_at,
        sort_key,
        start_date,
        end_date,
        estimation_points,
        created_at,
        list_id,
        closed_at,
        task_lists!inner (
          id,
          name,
          status,
          color,
          deleted,
          board_id,
          workspace_boards!inner (
            id,
            name,
            ticket_prefix,
            ws_id,
            workspaces (
              name
            )
          )
        ),
        assignees:task_assignees(
          user_id,
          user:users(
            id,
            display_name,
            avatar_url
          )
        ),
        labels:task_labels(
          label:workspace_task_labels(
            id,
            name,
            color,
            created_at
          )
        ),
        projects:task_project_tasks(
          ticket_number,
          created_at,
          project:task_projects(
            ticket_key,
            id,
            name,
            status
          )
        )
      `;

export const fullSelectAssignedToMe = `
        id,
        display_number,
        name,
        description,
        priority,
        completed,
        completed_at,
        sort_key,
        start_date,
        end_date,
        estimation_points,
        created_at,
        list_id,
        closed_at,
        task_lists!inner (
          id,
          name,
          status,
          color,
          deleted,
          board_id,
          workspace_boards!inner (
            id,
            name,
            ticket_prefix,
            ws_id,
            workspaces (
              name
            )
          )
        ),
        _currentUserAssignment:task_assignees!inner(
          user_id
        ),
        assignees:task_assignees(
          user_id,
          user:users(
            id,
            display_name,
            avatar_url
          )
        ),
        labels:task_labels(
          label:workspace_task_labels(
            id,
            name,
            color,
            created_at
          )
        ),
        projects:task_project_tasks(
          ticket_number,
          created_at,
          project:task_projects(
            ticket_key,
            id,
            name,
            status
          )
        )
      `;
