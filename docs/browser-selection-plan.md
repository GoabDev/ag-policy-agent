# Browser Selection Plan

## Context

The app currently launches Playwright Chromium with the Chrome channel hardcoded in `server/browser/controller.ts`:

```ts
channel: 'chrome'
```

That means every automation session uses installed Google Chrome.

## Goal

Allow the app to run automations with other Chromium-based browsers, such as Microsoft Edge or Brave, when Chrome is unreliable or when a portal behaves differently in another browser.

## Recommended First Version

Start with a global browser setting in the app settings:

- Chrome
- Microsoft Edge
- Brave
- Chromium bundled/default
- Custom executable path

This is the smallest safe implementation because the current browser controller uses one shared browser instance with multiple isolated contexts.

## Playwright Options

Microsoft Edge can use Playwright's Chromium channel support:

```ts
channel: 'msedge'
```

Brave usually requires an explicit executable path on Windows, for example:

```ts
executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
```

Chrome remains:

```ts
channel: 'chrome'
```

The bundled/default Chromium option can omit both `channel` and `executablePath`.

## Implementation Notes

- Keep the feature limited to Chromium-based browsers first.
- Store the selected browser in `settings.json`.
- Add the browser choice to the Settings UI.
- Update `launchBrowser()` to build Playwright launch options from settings.
- When the browser setting changes, close existing pages, contexts, workers, and the shared browser so the next operation relaunches with the selected browser.
- Update the dashboard text that currently says "Google Chrome Required".
- Validate that the selected browser exists before saving or before launch, especially for custom executable paths.

## Caveats

- The selected browser must already be installed on the machine.
- Existing saved session state may not transfer cleanly across browsers. Treat browser switching as requiring re-login, especially for NIID.
- Firefox and WebKit should not be included in the first version because portal behavior, selectors, downloads, and dialogs may differ.

## Possible Later Version

Per-platform browser selection is possible, for example:

- A&G: Chrome
- NIID: Edge
- NIID Push: Brave

That requires a larger browser-controller refactor because the app would need multiple browser instances keyed by browser choice instead of one shared browser instance.
