# A&G Policy Agent

A desktop automation tool that streamlines insurance policy corrections, upload status review, and policy push workflows across the A&G scratch-card platform, A&G E-PIN platform, NIID, and NIIP. Built with Electron, it reduces repetitive manual work by routing each policy to the correct platform automatically and applying updates across linked downstream systems.

![Platform: Windows](https://img.shields.io/badge/platform-Windows-blue)
![License: Private](https://img.shields.io/badge/license-Private-red)

---

## Features

### Policy Corrections

Automate corrections across the correct platform pair in a single action:

- Automatic platform routing detects scratch-card vs E-PIN policies from the policy number format.
- Scratch-card corrections run across A&G and NIID.
- E-PIN corrections run across E-PIN and NIIP.
- Name Correction updates policyholder first name and/or last name.
- Registration Correction updates vehicle registration number.
- Vehicle Make Correction updates vehicle make and model.
- Registration & Chassis Correction updates both registration and chassis numbers together.
- Chassis Correction updates chassis number only.
- Swap Correction updates multiple fields at once while ignoring empty values.

Swap corrections support partial updates for:

- Name, phone, email, and address
- Registration number, chassis number, and engine number
- Vehicle make, model, color, and year where applicable
- NIIP-only chassis normalization when a chassis number is shorter than 17 characters

### Policy Push

Upload scratch-card policies from A&G to NIID with two methods:

- By Policy Number uploads a single scratch-card policy.
- By Date Range downloads and uploads all scratch-card policies modified within a date range.

The system automatically downloads XLSX files from A&G Spool, processes them, and uploads to NIID. E-PIN policies are intentionally blocked from Policy Push.

### Policy Status

Review status from the appropriate source without leaving the app:

- E-PIN policy status supports lookup by policy number or registration number.
- Scratch-card policy status supports lookup by policy number or certificate number.
- E-PIN status returns NIID/NIIP upload tables and supports in-app reset.
- Scratch-card status returns summary verification data and supports a Track Details continuation for full transaction records.
- The task pauses after scraping so the operator can review the result before choosing the next action.
- Policy Status history is separate from Policy Push history.

### Automated Agent

Run unattended Policy Push workflows from a protected Automated Agent area:

- Current Day Repeater pushes the current day immediately, then repeats every 10 minutes until the day ends.
- Year-To-Date Batch Agent pushes from January 1 to the current date in two-day calendar batches.
- Continue Year-To-Date resumes from the last saved successful batch position instead of starting over.
- Dedicated automated sessions use separate A&G and NIID push browser sessions from the manual push workflow.
- Automation logs provide paginated log views with upload result previews and full push detail dialogs.

Manual Policy Push and automated Policy Push are queued separately but serialized through the same push lane, so overlapping uploads do not run against NIID at the same time.

### Session Management

- Independent browser sessions for A&G, NIID, E-PIN, and NIIP
- Shared session pages for scratch-card Policy Status and E-PIN Policy Status
- Separate automated A&G Push and automated NIID Push sessions for unattended agents
- Manual login support for NIID where CAPTCHA is required
- Auto-login for A&G, E-PIN, and NIIP
- Session keep-alive with configurable heartbeat intervals
- Automatic session inactivity timeout to kill idle sessions after a configurable period
- Stop All Sessions action to close and clear every manual and automated browser session
- Visual login status indicators for all correction platforms

### Real-Time Monitoring

- Live activity feed showing all system events as they happen
- Toast notifications for task success, failure, and warning events
- Correction history table with detail dialogs for field-level changes
- Dedicated Policy Status history with summary, trail, and full-detail views
- Push history and automation history tables with upload result previews and detail dialogs
- Backend-paginated automation logs to keep large histories responsive
- Worker pool status display with active workers and queue length
- Step-by-step task progress streaming via SSE

### Worker Pool

- Concurrent task execution with multiple Playwright browser workers
- Configurable max workers for parallel processing
- Automatic worker queue management

### Settings

- Headless mode toggle for browser visibility during debugging
- Log retention with automatic scheduled cleanup
- Session timeout for auto-killing idle sessions
- Max workers configuration
- Keep-alive interval configuration
- Notification preferences for all, errors only, or no notifications

### Theme

- Toggle between dark and light mode

---

## Download & Installation

### Windows

1. Go to the [Releases](../../releases) page
2. Download the latest `A.G.Policy.Agent.Setup.x.x.x.exe` installer
3. Run the installer and follow the setup wizard
4. Launch A&G Policy Agent from your Start menu or desktop shortcut

### Auto-Updates

The app automatically checks for updates on startup. When a new version is available:

1. The update downloads in the background.
2. You are notified when it is ready.
3. Restart the app to install the update.

---

## Getting Started

### First-Time Setup

1. Launch the application.
2. Log in to the sessions you need:
   - A&G Session for scratch-card corrections and scratch-card Policy Status
   - NIID Session for scratch-card downstream corrections
   - E-PIN Session for E-PIN corrections and E-PIN Policy Status
   - NIIP Session for E-PIN downstream corrections
   - NIID Push Session for scratch-card uploads
3. Enable keep-alive if you want sessions maintained automatically.
4. You are ready to run corrections, Policy Status lookups, and Policy Push tasks.

### Running a Policy Correction

1. Select the correction type from the dropdown.
2. Enter the policy number.
3. Fill in the correction details.
4. Click Submit. The app routes the policy automatically and applies the correction on the correct linked systems.
5. Monitor progress in the Live Activity feed.

### Running a Policy Push

1. Select the push method: By Policy Number or By Date Range.
2. Enter the policy number or date range.
3. Click Submit. The app downloads from A&G Spool and uploads to NIID.
4. Track progress in real time.

### Checking Policy Status

1. Open the Pol Status card on the dashboard.
2. Enter one of the supported lookup values:
   - E-PIN policy number
   - E-PIN registration number
   - Scratch-card policy number
   - Scratch-card certificate number
3. Click Check Status.
4. Review the returned data in the dialog.
5. Choose the next action:
   - Reset Push for E-PIN status workflows
   - Track Details for scratch-card verification workflows
   - Close when review is complete

### Running Automated Agents

1. Open Automated Agent from the app header.
2. Log in with an authorized automation account.
3. Start the automated A&G Push and automated NIID Push sessions from Session Management.
4. Start Current Day Repeater for continuous same-day pushes, or start/continue Year-To-Date Batch Agent for historical batches.
5. Review recent automation logs on the Automated Agent page, or open the full logs page for paginated history and complete push details.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop Shell | Electron 33 |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| Backend | Node.js, Express 5, TypeScript |
| Automation | Playwright |
| Forms & Validation | React Hook Form + Zod |
| State Management | TanStack React Query |
| Real-Time | Server-Sent Events |
| Build & Distribution | electron-builder, NSIS installer (Windows) |

---

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
cd client && npm install
cd ../server && npm install
cd ../electron && npm install
```

### Environment Variables

The backend reads configuration from `server/.env` during local development and from the packaged runtime environment in production.

```bash
# Scratch-card platform
AG_URL=https://3rdparty.card.aginsuranceapplications.com/
AG_POLICY_STATUS_URL=https://3rdparty.card.aginsuranceapplications.com/Utility/VerifyData.aspx
AG_SPOOL_URL=https://3rdparty.card.aginsuranceapplications.com/Policy/UploadPolicyData.aspx
AG_USERNAME=change-me
AG_PASSWORD=change-me

# E-PIN platform
EPIN_URL=https://3rdparty.aginsuranceapplications.com/
EPIN_PARK_URL=https://3rdparty.aginsuranceapplications.com/Policy/PolicyUpdateNIIP.aspx
EPIN_POLICY_STATUS_URL=https://3rdparty.aginsuranceapplications.com/Utility/NIIPNIIDUploadStatus.aspx
EPIN_USERNAME=change-me
EPIN_PASSWORD=change-me

# NIID correction and push
NIID_URL=https://www.niid.org/
NIID_POLICY_CORRECTION_URL=change-me
NIID_UPLOAD_URL=change-me
NIID_USERNAME=change-me
NIID_PASSWORD=change-me
NIID_ALT_USERNAME=change-me
NIID_ALT_PASSWORD=change-me

# NIIP correction
NIIP_URL=https://www.niip.ng/Home/Index
NIIP_PARK_URL=https://www.niip.ng/Company/ActivePolicies
NIIP_USERNAME=change-me
NIIP_PASSWORD=change-me

# Runtime
PORT=3001
HEADLESS=true
MAX_WORKERS=5
KEEPALIVE_INTERVAL=5
NIID_KEEPALIVE_INTERVAL=2
SESSION_INACTIVITY_HOURS=5

# Automated Agent access
AUTOMATED_AGENT_EMAILS=automation-user@example.com
AUTOMATED_AGENT_PASSWORD=change-me
```

Keep real credentials out of source control. Add or rotate authorized automation emails in the environment, then restart the backend or Electron app so the new values are loaded.

### Running in Development

```bash
# Terminal 1
cd server
npm run dev

# Terminal 2
cd client
npm run dev

# Terminal 3
cd electron
npm start
```

### Building for Production

```bash
cd electron

npm run dist:win
npm run dist:mac
```

Build output goes to `electron/dist/`.

### Release Checklist

Use this checklist whenever you publish a new app version:

1. Bump the version consistently in:
   - `client/package.json`
   - `server/package.json`
   - `electron/package.json`
   - the visible UI version text
   - the changelog entry in this README
2. Rebuild the frontend so `client/out` matches the current source and version.
3. Build the Windows installer with `npm run dist:win` from `electron/`.
4. Publish the full Electron updater artifact set from `electron/dist/`, not just the app executable.
5. Confirm the GitHub release contains:
   - the setup installer `.exe`
   - `latest.yml`
   - generated `.blockmap` files
6. Share the installer build with users. Do not share a copied app folder or unpacked executable as the primary install method.
7. Install the release on a test machine and use the in-app `Check Updates` button to verify the updater can contact the published release feed.

### Auto-Update Notes

Auto-update depends on release packaging and publishing, not just the app code:

- Users should install the NSIS setup installer build.
- The GitHub release must include `latest.yml` and the matching installer artifacts generated by `electron-builder`.
- If a user installs from a copied folder instead of the setup installer, update behavior can be missing or inconsistent.
- If the updater module is unavailable in a build, the app now stays usable and manual update checks will show a warning instead of crashing.

---

## Project Structure

```text
ag-policy-agent/
|-- client/                  # Next.js frontend
|   |-- app/                 # Routes and layout
|   |-- components/          # Dashboard, automated-agent, settings, and UI components
|   |-- hooks/               # SSE and shared client hooks
|   |-- queries/             # React Query hooks
|   |-- schema/              # Zod schemas
|   `-- service/             # API client layer
|-- server/                  # Express backend
|   |-- agents/              # Correction, Policy Push, Policy Status, and automated runners
|   |-- browser/             # Playwright actions, keepalive, controller, worker pool
|   |-- config/              # Environment configuration
|   |-- jobs/                # Scheduled jobs
|   |-- types/               # Shared task, session, and API types
|   `-- utils/               # Logger, policy classifier, vehicle options, XLSX processing
|-- electron/                # Electron main process and updater
`-- storage/                 # Runtime sessions, logs, and persisted agent state
```

Automated agent progress is persisted in `storage/automated-agent-state.json`. Push logs and Policy Status logs are stored with normal task history so the app can reuse the same detail, step, and result dialogs across restarts.

---

## Changelog

### v2.3.0 - E-PIN, NIIP, Swap, and Policy Status Expansion

#### New Features

- E-PIN + NIIP correction lane with dedicated sessions, login flows, and policy-number routing
- Swap correction for partial multi-field updates while ignoring empty values
- E-PIN Policy Status with lookup by policy number or registration number, extracted summary/trail data, and in-app reset
- Scratch-card Policy Status with lookup by policy number or certificate number, plus Track Details for full transaction records
- Dedicated Policy Status history separated from Policy Push history
- Shared vehicle option normalization for make/model/color handling

#### Improvements

- Automatic routing between scratch-card and E-PIN correction paths
- NIIP search, endorse, and success waits tuned for slower page transitions
- E-PIN correction flows aligned more closely with the A&G loading and confirmation patterns
- Swap history rendering summarized in the table and expanded in detail dialogs
- Scratch-card Policy Status now reuses the authenticated A&G session, and E-PIN Policy Status reuses the E-PIN session
- Shared network timeout setting added for AG, E-PIN, NIID, and NIIP with simple 1, 2, 5, 10, and 15 minute options in Settings

### v2.2.0 - Automated Policy Push Agents

#### New Features

- Automated Agent page for unattended Policy Push workflows
- Current Day Repeater that pushes today's policies immediately and every 10 minutes until the day ends
- Year-To-Date Batch Agent that pushes January 1 through today in two-day real-calendar batches
- Continue Year-To-Date resumes from saved progress when a historical run stops before reaching today
- Dedicated automated sessions so automated A&G Push and NIID Push stay separate from manual push sessions
- Stop All Sessions closes and clears every manual and automated browser session from one action
- Automation log views with recent logs, paginated history, upload previews, and detail dialogs

#### Improvements

- Shared push queue safety so manual and automated push work do not collide in NIID
- Automation progress persistence through saved agent state
- Session stability fixes for push session heartbeat and activity tracking
- Expired login handling for protected automated dashboards

### v2.1.2 - Startup Recovery, Session Fixes & UX Improvements

- Startup timeout fix with a more reliable Electron startup handshake
- Startup recovery actions on the splash screen for retry and clear-sessions-and-retry
- Saved session self-healing after repeated recovery failures
- Session-specific notifications that identify the exact session that needs attention
- Immediate NIID activation after manual NIID and NIID Push logins

### v2.1.1 - Auto-Update UX Improvements

- Download progress indicator in the taskbar and window title during auto-updates
- Update error notifications when a download fails

### v2.1.0 - History Redesign, Upload Results & Headless Toggle

#### New Features

- Tabbed History Table separating correction and push history
- Detail dialogs for full task details, field changes, and errors
- Copy buttons for policy numbers, errors, and upload results
- NIID upload result tracking after Policy Push
- Real-time `push:uploading` SSE events during NIID uploads
- Headless mode runtime toggle without restarting the app
- Push history persistence across restarts

#### Improvements

- A&G Spool download rewrite with a popup-tab-based flow and updated selectors
- NIID upload flow rewrite with progress handling, result parsing, and long upload waits
- Task filtering so correction and push histories stay separate
- Correction logs API refinement
- Session Control layout simplification

### v2.0.0 - Settings, Policy Push & Enhanced Sessions

#### New Features

- Settings page for headless mode, log retention, session timeout, max workers, keep-alive intervals, and notifications
- Policy Push system for A&G Spool to NIID uploads by policy number or date range
- Chassis correction
- Registration & Chassis correction
- Vehicle data combobox
- Toast notifications
- Cancelled task status

#### Improvements

- Separate NIID Push session with alternate credentials
- Configurable keep-alive intervals
- Session inactivity timeout
- Automatic log cleanup
- Electron production path handling
- Dynamic port allocation
- Enhanced SSE events
- Worker pool improvements

### v1.0.1 - Toast Notifications

- Added toast notifications for success, error, and warning events

### v1.0.0 - Initial Release

- Policy corrections for name, registration, and vehicle make
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
