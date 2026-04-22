# Automated Policy Push Agent Plan

## Goal

Add a complete automated policy push area to the app. After the required A&G and NIID Push browser sessions have been logged in, the automated agents should run without human intervention.

The existing manual correction and manual policy push features must remain usable. Automated work must not interrupt or corrupt manual work.

## Current System Context

The app already has a manual policy push pipeline:

- Download policies from A&G Spool.
- Process the downloaded XLSX by renaming the worksheet to `Sheet1`.
- Upload the processed file to NIID.
- Stream progress through SSE events.
- Store policy push task history.

The relevant backend flow is currently centered around `runPolicyPush(input)` in `server/agents/policyPushRunner.ts`.

The relevant browser sessions are:

- `ag`: A&G correction session.
- `niid`: NIID correction session.
- `ag_push`: A&G spool session for policy push.
- `niid_push`: NIID upload session for policy push.

NIID still requires manual login because of CAPTCHA. Once `niid_push` has been logged in, the app can reuse the saved session.

## New User Experience

Add an **Automated Agent** button in the app header. The button redirects to a new Automated Agent page.

The Automated Agent page should require app-level login before access. This is separate from A&G/NIID browser login.

The page should show:

- A&G Push session status.
- NIID Push session status.
- The shared Session Management controls used by the manual dashboard.
- Automated agent status.
- Current active automated job.
- Recent automated runs.
- Controls to start and stop each automated agent.

The page should disable automated start controls until both required browser sessions are active:

- `ag_push`
- `niid_push`

Only one automated agent can be active at a time.

Users must also be able to stop all sessions from the Automated Agent page. This action should stop heartbeats, close all browser windows, destroy worker contexts, clear saved session files, and mark all session statuses inactive.

## Agent A: Current Day Repeater

Agent A repeatedly pushes policies for the current calendar day.

Behavior:

- Date range is `today -> today`.
- Runs once immediately when started.
- Runs again every 10 minutes.
- Stops automatically when the calendar day ends.
- Uses real calendar dates from the system clock.
- Does not start a new run if a previous run is still active.
- If a run fails, retry that same run once.
- If the retry fails, log the failure and continue waiting for the next interval.

Example on April 22, 2026:

- First run: `22-Apr-2026` to `22-Apr-2026`
- Next run: 10 minutes later, same range
- Stops at the transition into April 23, 2026

## Agent B: Year-To-Date Batch Agent

Agent B pushes policies from the beginning of the current year to the current date, then stops.

Behavior:

- **Start** begins from January 1 of the current year and resets Year-To-Date progress counters.
- **Continue** resumes from the saved `nextDate` and pushes from there to the current date.
- Ends at today.
- Uses 2-day batches.
- Uses real calendar date arithmetic to avoid month length and leap year bugs.
- Runs one batch at a time.
- Allows manual policy pushes to run between batches.
- If a batch fails, retry that same batch once.
- If the retry fails, log the failure and continue to the next batch unless the failure means the browser session is expired.
- Persists progress so it can resume after app restart.
- Stops automatically after the final batch reaches today.

Example:

- Batch 1: `01-Jan-2026` to `02-Jan-2026`
- Batch 2: `03-Jan-2026` to `04-Jan-2026`
- Batch 3: `05-Jan-2026` to `06-Jan-2026`

If today leaves one remaining day, the final batch can be one day.

Example:

- Final batch: `21-Apr-2026` to `21-Apr-2026`

## Manual Work Protection

Manual policy push and automated policy push should use separate browser sessions so a background automated agent cannot navigate away from a page being used by a manual user.

Manual policy push sessions:

- `ag_push`
- `niid_push`

Automated policy push sessions:

- `ag_auto_push`
- `niid_auto_push`

Agent A and Agent B should share the automated push sessions. Only one automated agent can be active at a time. This avoids duplicate uploads, reduces NIID login/CAPTCHA burden, and avoids unknown platform-side behavior from multiple simultaneous NIID uploads.

The manual sessions and automated sessions can be logged in, kept alive, and stopped independently. The global **Stop All Sessions** action must still close and clear every manual and automated session.

The automated page should expose session controls for:

- manual dashboard sessions, through the reused `SessionControl` component
- automated push sessions, through automated-specific login controls

### Queue Rules

Manual and automated push jobs no longer share the same browser pages, but concurrency still needs to be conservative because NIID and A&G may not handle simultaneous uploads well.

- Manual policy pushes use `ag_push` and `niid_push`.
- Automated policy pushes use `ag_auto_push` and `niid_auto_push`.
- Automated agents must never interrupt an active manual policy push.
- Agent A should skip an interval if another push is already running.
- Agent B should pause between batches if manual policy push work is waiting.
- Manual policy push should get priority before the next automated batch or interval starts.
- Only one automated agent can run at a time.

Manual corrections can remain separate because they use the correction sessions:

- `ag`
- `niid`

## Failure Handling

For ordinary push failures:

- Retry once.
- If retry fails, log the failure.
- Agent A continues to the next interval.
- Agent B continues to the next batch.

For session failures:

- Stop the automated agent.
- Mark status as requiring login.
- Surface the issue in the UI.
- Do not continue until the user logs in again.

For app shutdown:

- Agent A does not need to resume automatically unless explicitly started again.
- Agent B should persist progress and support resume.

## Backend Implementation Plan

### 1. Add Shared Policy Push Queue

Create a small queue/lock layer for work that uses `ag_push` and `niid_push`.

Suggested file:

- `server/agents/policyPushQueue.ts`

Responsibilities:

- Serialize policy push jobs.
- Track whether the push lane is busy.
- Allow manual jobs to take priority before automated jobs.
- Expose current queue/status for API/UI.

The existing `runPolicyPush(input)` should be wrapped by this queue instead of being called directly from route handlers and automated loops.

### 2. Add Automated Agent Service

Suggested file:

- `server/agents/automatedPolicyAgent.ts`

Responsibilities:

- Start/stop Agent A.
- Start/stop Agent B.
- Track active mode.
- Generate date ranges.
- Retry failed batches once.
- Detect session-required failures.
- Persist Agent B progress.
- Emit SSE events for automated status.

### 3. Add Persistent State

Suggested storage file:

- `storage/automated-agent-state.json`

State should include:

- active agent mode
- Agent B next start date
- completed batches
- failed batches
- last run status
- timestamps

Do not store passwords or NIID credentials in this file.

### 4. Add API Routes

Suggested routes:

- `GET /api/automated-agent/status`
- `POST /api/automated-agent/current-day/start`
- `POST /api/automated-agent/year-to-date/start`
- `POST /api/automated-agent/stop`
- `GET /api/automated-agent/logs`

The start routes should validate:

- no automated agent is already running
- `ag_push` is active
- `niid_push` is active

### 5. Add App-Level Login Gate

Add simple app-level authentication for the Automated Agent page.

Recommended first version:

- Password configured from environment/settings.
- Client submits password to backend.
- Backend returns a short-lived local auth token or session flag.
- Automated Agent API routes require that token.

This is for access control inside the desktop app, not for A&G or NIID login.

### 6. Add Frontend Page

Suggested files:

- `client/app/automated-agent/page.tsx`
- `client/components/automated-agent/AutomatedAgentPage.tsx`
- `client/queries/useAutomatedAgent.ts`

Page controls:

- Login form if not authenticated.
- Start Current Day Repeater.
- Start Year-To-Date Batch Agent.
- Stop active automated agent.
- Agent status panel.
- Current or next date range.
- Recent automated run table.

### 7. Add Header Navigation

Update:

- `client/components/dashboard/Header.tsx`

Add an **Automated Agent** button that routes to `/automated-agent`.

## Date Formatting

The existing policy push date range uses strings like:

- `01-Feb-2026`

Date generation should use real date objects and format only at the boundary before calling policy push.

Use calendar-safe operations such as:

- add one day
- add two days
- clamp final batch end date to today

## Verification Plan

Backend:

- Build TypeScript server.
- Test manual policy push still queues and runs.
- Test only one policy push uses browser pages at once.
- Test Agent A interval behavior.
- Test Agent B batch generation across month boundaries.
- Test leap year date generation.
- Test stop behavior.
- Test session-missing validation.

Frontend:

- Build Next.js client.
- Confirm new header button routes correctly.
- Confirm Automated Agent page requires login.
- Confirm start buttons are disabled when sessions are missing.
- Confirm status updates while automated jobs run.

Regression:

- Manual correction flow still works.
- Manual policy push still works.
- Existing settings page still works.
- Existing logs/history still render.
