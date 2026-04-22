# A&G Policy Agent

A desktop automation tool that streamlines insurance policy corrections and uploads across the **A&G Platform** and **NIID (National Insurance Information Database)**. Built with Electron, it eliminates repetitive manual data entry by automating policy updates across both systems simultaneously.

![Platform: Windows](https://img.shields.io/badge/platform-Windows-blue)
![License: Private](https://img.shields.io/badge/license-Private-red)

---

## Features

### Policy Corrections

Automate corrections across both A&G and NIID platforms in a single action:

- **Name Correction** — Update policyholder first name and/or last name
- **Registration Correction** — Update vehicle registration number
- **Vehicle Make Correction** — Update vehicle make and model (with searchable combobox for vehicle data)
- **Registration & Chassis Correction** — Update both registration and chassis numbers together
- **Chassis Correction** — Update chassis number only

### Policy Push (Upload)

Upload policies from A&G to NIID with two methods:

- **By Policy Number** — Upload a single specific policy
- **By Date Range** — Download and upload all policies modified within a date range

The system automatically downloads XLSX files from A&G Spool, processes them, and uploads to NIID.

### Automated Agent

Run unattended policy push workflows from a protected Automated Agent area:

- **Current Day Repeater** — Pushes the current day immediately, then repeats every 10 minutes until the day ends
- **Year-To-Date Batch Agent** — Pushes from January 1 to the current date in two-day calendar batches
- **Continue Year-To-Date** — Resumes from the last saved successful batch position instead of starting over
- **Dedicated automated sessions** — Uses separate A&G and NIID push browser sessions from the manual push workflow
- **Automation logs** — Paginated log views with upload result previews and full push detail dialogs

Manual policy push and automated policy push are queued separately but serialized through the same push lane, so overlapping uploads do not run against NIID at the same time.

### Session Management

- Independent browser sessions for A&G, NIID Corrections, and NIID Push
- Separate automated A&G Push and automated NIID Push sessions for unattended agents
- Manual login support for NIID (handles CAPTCHA)
- Auto-login for A&G platform
- Session keep-alive with configurable heartbeat intervals (separate intervals for A&G and NIID)
- Automatic session inactivity timeout — idle sessions are killed after a configurable period
- Stop All Sessions action to close and clear every manual and automated browser session
- Visual login status indicators

### Real-Time Monitoring

- Live activity feed showing all system events as they happen
- Toast notifications for task success, failure, and warning events
- Correction history table with color-coded status indicators (pending, running, completed, failed, cancelled)
- Push history and automation history tables with upload result previews and detail dialogs
- Backend-paginated automation logs to keep large histories responsive
- Worker pool status display (active workers, queue length)
- Step-by-step task progress streaming via SSE

### Worker Pool

- Concurrent task execution with multiple Playwright browser workers
- Configurable max workers for parallel processing
- Automatic worker queue management

### Settings

- **Headless mode** — Toggle browser visibility for debugging
- **Log retention** — Configurable log cleanup with automatic scheduled cleanup
- **Session timeout** — Set inactivity timeout for auto-killing idle sessions
- **Max workers** — Configure the number of concurrent browser workers
- **Keep-alive intervals** — Separate configurable intervals for A&G and NIID sessions
- **Notification preferences** — Choose between all, errors only, or no notifications

### Dark/Light Theme

- Toggle between dark and light mode for comfortable viewing

---

## Download & Installation

### Windows

1. Go to the [Releases](../../releases) page
2. Download the latest `A.G.Policy.Agent.Setup.x.x.x.exe` installer
3. Run the installer and follow the setup wizard
4. Launch **A&G Policy Agent** from your Start menu or desktop shortcut

### Auto-Updates

The app automatically checks for updates on startup. When a new version is available:

1. The update downloads in the background
2. You'll be notified when it's ready
3. Restart the app to install the update

---

## Getting Started

### First-Time Setup

1. Launch the application
2. Log in to your sessions:
   - **A&G Session** — Click "Login A&G" (auto-login, no CAPTCHA)
   - **NIID Session** — Click "Login NIID" (manual login required for CAPTCHA)
   - **NIID Push Session** — Click "Login NIID Push" (manual login, uses alternate credentials)
3. Enable keep-alive to maintain your sessions
4. You're ready to run corrections and policy pushes

### Running a Policy Correction

1. Select the correction type from the dropdown
2. Enter the policy number
3. Fill in the correction details (varies by type)
4. Click **Submit** — the app will apply the correction on both A&G and NIID automatically
5. Monitor progress in the Live Activity feed

### Running a Policy Push

1. Select push method: **By Policy Number** or **By Date Range**
2. Enter the policy number or date range
3. Click **Submit** — the app downloads from A&G Spool and uploads to NIID
4. Track progress in real-time

### Running Automated Agents

1. Open **Automated Agent** from the app header
2. Log in with an authorized automation account
3. Start the automated A&G Push and automated NIID Push sessions from Session Management
4. Start **Current Day Repeater** for continuous same-day pushes, or start/continue **Year-To-Date Batch Agent** for historical batches
5. Review recent automation logs on the Automated Agent page, or open the full logs page for paginated history and complete push details

---

## Tech Stack

| Layer                | Technology                                     |
| -------------------- | ---------------------------------------------- |
| Desktop Shell        | Electron 33                                    |
| Frontend             | Next.js 16, React 19, TailwindCSS 4, Shadcn/UI |
| Backend              | Node.js, Express 5, TypeScript                 |
| Automation           | Playwright (headless/headed browser control)   |
| Forms & Validation   | React Hook Form + Zod                          |
| State Management     | TanStack React Query                           |
| Real-Time            | Server-Sent Events (SSE)                       |
| Build & Distribution | electron-builder, NSIS installer (Windows)     |

---

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Install dependencies for all packages
cd client && npm install
cd ../server && npm install
cd ../electron && npm install
```

### Environment Variables

The backend reads configuration from `server/.env` during local development and from the packaged runtime environment in production.

```bash
# Comma-separated list of emails allowed to access the Automated Agent page
AUTOMATED_AGENT_EMAILS=automation-user@example.com

# Shared password for Automated Agent access
AUTOMATED_AGENT_PASSWORD=change-me
```

Keep real credentials out of source control. Add or rotate authorized automation emails in the environment, then restart the backend/Electron app so the new values are loaded.

### Running in Development

```bash
# Terminal 1: Start the backend server
cd server
npm run dev

# Terminal 2: Start the frontend dev server
cd client
npm run dev

# Terminal 3: Start Electron (after both servers are running)
cd electron
npm start
```

### Building for Production

```bash
cd electron

# Build for Windows
npm run dist:win

# Build for macOS
npm run dist:mac
```

Build output goes to `electron/dist/`.

---

## Project Structure

```
ag-policy-agent/
├── client/                  # Next.js frontend (React UI)
│   ├── app/                 # Pages and layout
│   ├── components/          # UI components (dashboard, forms, etc.)
│   ├── hooks/               # Custom hooks (SSE, etc.)
│   ├── queries/             # React Query hooks
│   ├── schema/              # Zod validation schemas
│   └── service/             # API client layer
├── server/                  # Express backend
│   ├── agents/              # Task runners (corrections, policy push)
│   ├── browser/             # Playwright automation & worker pool
│   ├── config/              # Environment configuration
│   ├── jobs/                # Scheduled jobs (log cleanup)
│   ├── services/            # Automation orchestration, sessions, queues
│   ├── types/               # TypeScript interfaces
│   └── utils/               # Logger, XLSX processor
├── electron/                # Electron main process
│   ├── main.js              # App entry point
│   ├── preload.js           # Context-isolated preload script
│   └── splash.html          # Startup splash screen
└── storage/                 # Runtime data (sessions, logs, vehicle data)
```

Automated agent progress is persisted in `storage/automated-agent-state.json`. Push logs are stored with the normal task log history so automation entries can reuse the same result, error, step, and upload-detail views as manual push history.

---

## Changelog

### v2.2.0 — Automated Policy Push Agents

#### New Features

- **Automated Agent page** — Protected app area for unattended policy push workflows
- **Current Day Repeater** — Pushes today's policies immediately and every 10 minutes until the day ends
- **Year-To-Date Batch Agent** — Pushes January 1 through today in two-day real-calendar batches
- **Continue Year-To-Date** — Resumes from saved progress when a historical run stops before reaching today
- **Dedicated automated sessions** — Automated A&G Push and NIID Push sessions are separate from manual push sessions
- **Stop All Sessions** — Closes and clears every manual and automated browser session from one action
- **Automation log views** — Recent log table, full paginated logs page, upload result previews, and complete detail dialogs

#### Improvements

- **Shared push queue safety** — Manual and automated push work is serialized so concurrent agents do not collide in NIID
- **Automation progress persistence** — Year-to-date progress survives restarts through persisted agent state
- **Session stability fixes** — Push session heartbeat and activity tracking now use the correct configured URLs and refresh activity timestamps correctly
- **Expired login handling** — Automated pages validate access before rendering protected dashboards to avoid login/dashboard flicker

### v2.1.2 — Startup Recovery, Session Fixes & UX Improvements

- **Startup timeout fix** — Electron now uses a more reliable startup handshake and a longer timeout to avoid false server start failures
- **Startup recovery actions** — Splash screen now offers retry and clear-sessions-and-retry actions instead of forcing users to relaunch manually
- **Saved session self-healing** — Broken saved sessions are automatically cleared after repeated recovery failures
- **Session-specific notifications** — Login and recovery toasts now identify the exact session that needs attention
- **Immediate NIID activation** — Manual NIID and NIID Push logins now become active immediately without requiring an app restart

### v2.1.1 — Auto-Update UX Improvements

- **Download progress indicator** — Taskbar progress bar and window title show download percentage during auto-updates
- **Update error notifications** — User-facing error dialog when an update fails to download, instead of silently swallowing errors

### v2.1.0 — History Redesign, Upload Results & Headless Toggle

#### New Features

- **Tabbed History Table** — Corrections and Push history displayed in separate tabs for clearer navigation
- **Detail Dialogs** — Click any history row to view full details including steps, field changes, and errors
- **Copy Buttons** — One-click copy for policy numbers, error messages, and upload results
- **NIID Upload Result Tracking** — Captures and displays actual upload result text from NIID after policy push
- **Upload Progress Events** — Real-time `push:uploading` SSE events with elapsed time during NIID uploads
- **Headless Mode Runtime Toggle** — Changing headless mode in settings automatically relaunches the browser without restarting the app
- **Push History Persistence** — Push task logs now persisted to disk and merged across restarts

#### Improvements

- **A&G Spool Download Rewrite** — New popup-tab-based download flow with updated selectors matching the current A&G Spool page
- **NIID Upload Flow Rewrite** — Handles Telerik RadUploadProgressArea, loading states, result panel parsing, and 5-minute timeout with periodic progress events
- **Task Filtering** — Correction form only shows correction tasks; push tasks are separated into their own view
- **Correction Logs API** — `/api/corrections/logs` now returns only correction-type logs; push logs served separately
- **Session Control Layout** — Simplified from 4-column to 3-column grid

### v2.0.0 — Settings, Policy Push & Enhanced Sessions

#### New Features

- **Settings page** — Dedicated settings UI to configure headless mode, log retention, session timeout, max workers, keep-alive intervals, and notification preferences
- **Policy Push system** — Upload policies from A&G Spool to NIID by policy number or date range, with automatic XLSX download and processing
- **Chassis correction** — New standalone chassis number correction type
- **Registration & Chassis correction** — New combined registration and chassis correction type
- **Vehicle data combobox** — Searchable dropdown for vehicle make/model selection
- **Toast notifications** — Real-time toast notifications (via Sonner) for task success, failure, and warning events
- **Cancelled task status** — Tasks can now be cancelled, with proper status tracking

#### Improvements

- **Separate NIID Push session** — Independent browser session with alternate credentials for policy uploads
- **Configurable keep-alive intervals** — Separate intervals for A&G and NIID sessions
- **Session inactivity timeout** — Automatically kill idle sessions after a configurable period
- **Automatic log cleanup** — Scheduled job to clean up old log files based on retention settings
- **Electron production paths** — Proper resource path resolution for Electron production builds
- **Dynamic port allocation** — Server supports port 0 for automatic port assignment
- **Enhanced SSE events** — New event types for push tasks, cancellation, login prompts, and login failures
- **Worker pool improvements** — Better queue management and status reporting

### v1.0.1 — Toast Notifications

- Add toast notifications for success, error, and warning events

### v1.0.0 — Initial Release

- Policy corrections: name, registration, vehicle make
- Session management with keep-alive for A&G and NIID
- Real-time live activity feed with SSE
- Dark/light theme support
- Windows installer with auto-update support

---

## Author

**Ajogu Joseph**

---

## License

This software is proprietary. All rights reserved.
