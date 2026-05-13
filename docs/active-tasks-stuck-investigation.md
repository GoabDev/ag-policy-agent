# Active Tasks Stuck Investigation

Date noted: 2026-05-13

## Summary

The dashboard can show multiple correction tasks stuck under `Active Tasks`, each with `0 steps`, even though the live event logs show some of those tasks already failed in the backend.

This may be either:

- A UI state issue where failed/queued tasks are not removed from the active task list.
- A backend worker queue issue where tasks remain queued indefinitely.
- A mixed issue where some tasks fail, but queued tasks remain active because workers are saturated or stale.

## Screenshot Context

The screenshot shows `ACTIVE TASKS (6)` with correction cards such as:

- `swap correction` for `P/Ag/pmi/26/lag/c2224053`
- `registration correction` for `P/AG/PMI/26/LAG/C224007`
- multiple `name correction` tasks for E-PIN policy numbers
- `vehicle_make correction` for `P/AG/PMI/26/LAG/C2204003`

Each visible task shows `0 steps`, which suggests the UI still considers them active even though the logs show some related tasks failed.

## Relevant Log Clues

The logs show repeated E-PIN corrections completing the E-PIN portion, then failing when trying to continue to NIIP:

```text
Worker c5099d9e: NIIP session expired, re-logging in...
Task failed: page.fill: Timeout 30000ms exceeded. Call log:
- waiting for locator('input[name="Username"]')
Worker c5099d9e released
Task ... finished with status: failed
```

There are also queued tasks after all workers are busy:

```text
All 6 workers busy, queuing request...
```

Later, heartbeat logs show sessions being saved successfully:

```text
Session saved for NIIP
Heartbeat OK - NIIP
```

This suggests some tasks may have failed because the worker tried to recover NIIP by filling a login form that was not present, while other submitted tasks may have remained queued behind busy or stale workers.

## Hypotheses

1. `activeTasks` is frontend-only SSE state. If a terminal event is missed, a task can remain visually active.
2. The backend `waitQueue` has no timeout or cancellation path, so queued tasks can appear stuck if workers are saturated.
3. Workers that hit NIIP login/session problems may be released and reused instead of destroyed, causing repeated failures.
4. When a worker fails during a multi-site correction, the frontend may show `0 steps` for queued tasks because only `task:started` was emitted before the worker was acquired.

## Follow-Up Checks

- Confirm whether the stuck task IDs still exist in backend `runningTasks` or only in frontend state.
- Add an endpoint or log line to inspect worker pool state, queue length, and queued task IDs.
- Consider emitting a `task:queued` state separately from `task:started`.
- Add queue timeout handling so tasks do not remain pending forever.
- Destroy workers after session-expired recovery failures, especially for NIIP/NIID.
- Rehydrate active tasks from backend state after navigation so the UI cannot keep phantom active tasks.

## Related Recent Work

- Manual login now destroys worker contexts for refreshed sessions so retries use the newly saved session.
- Correction history refresh was fixed by invalidating queries on terminal SSE events and emitting terminal events after saving history.
- Targeted correction mode now supports `auto`, primary-only, and secondary-only behavior.

## Fix Applied

- Worker queue entries now time out instead of waiting forever.
- Queued correction worker requests are removed if the correction is cancelled.
- Worker queue dispatch now scans for any compatible available worker instead of only checking the just-released worker.
- Failed or cancelled correction workers are destroyed instead of released for reuse.
- `/api/status` now includes running push tasks as well as running correction tasks.
- The dashboard periodically reconciles active task cards against backend running tasks, so missed terminal SSE events cannot leave phantom active cards visible.
