# HAHL Maintenance Form

Public-hosted Progressive Web App for Heart and Home Living maintenance requests.

Submitters fill in the form, submit, the n8n pipeline picks it up, creates a ClickUp task and emails the notification recipient.

## Live URL

This repo is configured for GitHub Pages. Once enabled, the form will be served at:

```
https://<github-username>.github.io/<repo-name>/
```

Replace `<github-username>` and `<repo-name>` with the actual values once the repo is live.

## Files

- `index.html`: the form itself, a 9-step wizard with conditional SOP gates per maintenance category, mandatory photo and room, severity tiers, and a Settings page.
- `manifest.json`: PWA manifest; allows installation as an app on iOS, Android, and desktop.
- `service-worker.js`: caches the form's shell so it opens offline. Webhook POSTs always go to the network.
- `icon-192.png`, `icon-512.png`, `icon-maskable.png`: placeholder icons. Replace with real branded icons before production.

## How to install on a device

**iOS (Safari):** Open the URL, tap Share, tap "Add to Home Screen".

**Android (Chrome):** Open the URL, tap the three-dot menu, tap "Install app".

**Desktop (Chrome/Edge):** Open the URL, click the install icon in the address bar.

## What it does on submit

The form POSTs the submission payload to a configured n8n webhook. The n8n workflow:

1. Generates a `MAINT-2026-XXXX` reference number.
2. Creates a task in the ClickUp Non Routine Maintenance list with a formatted markdown summary.
3. Emails the configured "Mark" recipient (configurable via the form's Settings page).
4. Emails the submitter a confirmation with the reference number.

## Settings

A "Settings" button at the bottom of the form opens a panel where the user can configure:

- Where the Mark-side notification email goes.
- An optional override for the submitter confirmation recipient.
- The webhook URL.

Settings are saved to localStorage per-device. Server-side global settings are a planned future enhancement.

## Source

Built from the HAHL Callout Manual (Section 6 troubleshooting guides, Section 8 form structure) and the Groundsman maintenance checklist. Source documents live in the private HAHL Shared Projects vault.
