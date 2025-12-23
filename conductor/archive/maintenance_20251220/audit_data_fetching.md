# Audit: Data Fetching Patterns

## Summary
This audit identifies components using `useEffect` for data fetching, which violates the project's requirement to use `TanStack Query`.

## Confirmed Violations (High Priority)
The following files have been confirmed to trigger `fetch` calls within `useEffect` hooks and must be migrated to `useQuery` or `useMutation`.

1.  **`apps/web/src/app/[locale]/(dashboard)/[wsId]/calendar/components/time-tracker.tsx`**
    *   **Issue:** `fetchData` function wraps `fetch` and is called inside `useEffect` on mount/open.
    *   **Action:** Migrate `categories`, `sessions`, `stats`, and `templates` fetching to `useQuery`.

2.  **`apps/web/src/app/[locale]/(dashboard)/[wsId]/(ai)/datasets/[datasetId]/explore/dataset-crawler.tsx`**
    *   **Issue:** `fetchColumnsAndRows` function performs `await fetch(...)` and is called inside `useEffect`.
    *   **Action:** Migrate to `useQuery` with `datasetId` as key.

3.  **`apps/web/src/app/[locale]/(dashboard)/[wsId]/tasks/projects/[projectId]/task-project-detail.tsx`**
    *   **Issue:** `fetchWorkspaceMembers` and `fetchUpdates` are called inside `useEffect`.
    *   **Action:** Migrate member fetching and updates to `useQuery`.

4.  **`apps/web/src/app/[locale]/(marketing)/onboarding/onboarding-flow.tsx`**
    *   **Issue:** `fetchPersonalWorkspace` is called inside `useEffect`.
    *   **Action:** Migrate to `useQuery` or handle in Server Action/Component if possible.

## Potential Candidates (Requires Verification)
The following files contain both `useEffect` and `fetch`, suggesting potential misuse.

*   `apps/web/src/app/[locale]/(dashboard)/[wsId]/tumeet/meetings/[meetingId]/audio-recorder.tsx`
*   `apps/web/src/app/[locale]/(dashboard)/[wsId]/users/[userId]/follow-up/client.tsx`
*   `apps/web/src/app/[locale]/(dashboard)/[wsId]/tasks/cycles/task-cycles-client.tsx`
*   `apps/web/src/app/[locale]/(dashboard)/[wsId]/tasks/habits/habit-form-dialog.tsx`
*   `apps/web/src/app/[locale]/(dashboard)/[wsId]/calendar/components/smart-schedule-preview-panel.tsx`
*   `apps/web/src/app/[locale]/(dashboard)/[wsId]/inquiries/inquiry-detail-modal.tsx`
*   `apps/web/src/app/[locale]/(dashboard)/[wsId]/crawlers/(default)/uncrawled/uncrawled-urls.tsx`
*   `apps/web/src/app/[locale]/(dashboard)/[wsId]/integrations/discord/discord-integration-dashboard.tsx`

## Migration Strategy
For each violation:
1.  Identify the state variables currently holding the fetched data (e.g., `const [data, setData] = useState(...)`).
2.  Replace `useState` and `useEffect` with:
    ```typescript
    const { data, isLoading, error } = useQuery({
      queryKey: ['entity', id],
      queryFn: () => fetch('/api/...').then(res => res.json())
    });
    ```
3.  Ensure `queryKey` includes all dependencies that were previously in the `useEffect` dependency array.
