<p align="center">
  <img src="public/brand/megit-logo.svg" width="250" alt="MeGit">
</p>

<p align="center"><strong>A visual Git workbench for multi-repository workflows</strong></p>
<p align="center">Map dependencies, verify what has landed, and inspect local Git history from one workflow.</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/Node.js-22.12%2B-43853d" alt="Node.js 22.12+"></a>
  <a href="#local-by-default"><img src="https://img.shields.io/badge/Local-127.0.0.1-1769aa" alt="Runs locally"></a>
  <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/Languages-EN%20%2F%20ZH-1769aa" alt="English and Simplified Chinese"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> · <a href="#features">Features</a> · <a href="#product-gallery">Screenshots</a> · <a href="README.zh-CN.md">简体中文</a>
</p>

![MeGit light theme: a shared library, a web app, and their release workflow](docs/screenshots/workflow.png)

## Features

- **Workflow canvas** — Each workflow has one canvas. Keep multiple workflows open in tabs, group repositories, map dependencies and release steps, and export as SVG or PNG. Each tab has workflow information on the left and a close button on the right. Closing the tab does not remove the workflow.
- **Integration checks** — See which source commits are missing from a target. Open the connection to inspect the comparison.
- **Connection shortcuts** — Pending push (blue, right) and pull (green, left) are visible without hovering when they can run. If a direction has no pending commits, its shortcut appears in gray on hover or keyboard focus and cannot be activated. Pull status reflects the last fetch. For two local repositories, edit the connection and enable fast-forward integration to move source commits into the checked-out target. Every action shows its direction and requires confirmation; the connection remains a comparison entry point.
- **Review and merge locally** — Enable *Review and merge* on a connection between two local repositories to compare their unique commits before changing anything. Prepare the merge in the checked-out target, review the staged result, and explicitly commit or abort. If files conflict, resolve and stage them in the target, then reopen the connection to continue. No remote or push is needed.
- **Git workbench** — Compare with the trunk or view the latest commit’s diff using the buttons beside each branch label. Stage changes, commit, and manage branches and remotes in the same workbench. Pull highlights in green when there are incoming commits, and Push highlights in blue when there are outgoing commits. Both show the sync direction and require confirmation. Fetch runs directly.
- **Optional AI assistant** — Ask about selected repositories, draft commit messages, and review proposed actions before applying them.
- **AI merge review** — Request a summary, possible risks, suggested checks, and a draft merge commit message in one request. Sending review content requires confirmation. Once the merge is ready, you can use or edit the draft without submitting the merge.

## Quick start

### Windows desktop

Run the Windows x64 installer, then open **MeGit** from the Start menu. The desktop app bundles its Node.js runtime and uses your existing Git for Windows installation. See the [desktop installation and build guide](desktop/README.md).

### Browser

Requires **Node.js 22.12+** and **Git** on your `PATH`.

```sh
git clone https://github.com/tojayon/MeGit.git
cd MeGit
npm ci
npm run build
npm start
```

Open **[127.0.0.1:4317](http://127.0.0.1:4317)**. On Windows, you can also double-click [`Start-MeGit.cmd`](Start-MeGit.cmd) in the checkout.

Add two local repositories and connect them with a **Code integration** edge to compare their Git refs by commit ancestry.

Hold **Shift** while dragging cards, groups, or a selection to move only horizontally or vertically. The main drag direction sets the axis until you release Shift. Auto snap only adjusts positions along that axis; hold **Alt** to bypass snapping without unlocking it.

Open a workflow under **My workflows**. Use **Workflow settings** in the upper-right canvas toolbar to edit its name and description or to remove it after confirmation. Local repositories are kept, and the last workflow cannot be removed. Global settings remain in the sidebar. To register or manage local repositories, open **Repository management** just above **Preferences**.

Workflow tabs span the canvas and the right-hand details. Repository and relationship controls are at the bottom of their respective panels. Each workflow remembers which details were open, the active detail, and the panel width when you switch workflows or reload the browser tab. Select **Hide workflow panel** just to the left of **+** under **My workflows** to give the details the full workspace width without closing any tabs. Use the same button to show the canvas again.

When the detail columns do not fit, use the arrows at either end of the bottom row to browse them. Long titles stay on one line; hover or focus a title to see its full name. The details browser and branch map hide their scrollbars without disabling scrolling or panning.

## Product gallery

### AI assistant

![Floating AI chat with UI Library and Web App selected as references](docs/screenshots/ai-assistant.png)

*Demo conversation: two repository references, a release-readiness question, and a suggested next step.*

The reference picker is the first control in the reference row. The lower-left controls show what is sent and which capabilities are active. The model button opens Quick AI settings for the endpoint, model, and API key, next to the Send or Stop button in the message box’s lower-right cutout. Project delivery permissions remain in Software settings.

| Branch map | Integration comparison |
| :---: | :---: |
| [![Branch map showing forks, a merge, and HEAD](docs/screenshots/branch-map.png)](docs/screenshots/branch-map.png) | [![Comparison showing four missing commits and their ancestry](docs/screenshots/integration.png)](docs/screenshots/integration.png) |

<details>
<summary>Git visual classroom and dark mode</summary>

**Git visual classroom** — Step through a merge without touching a repository.

![Interactive Git lesson showing two branch histories joining](docs/screenshots/git-classroom.png)

**Dark mode** — The same release workflow in the dark theme.

![MeGit release workflow in dark mode](docs/screenshots/workflow-dark.png)

</details>

## Local by default

Open **Settings** from the sidebar to configure the AI service and network proxy. AI connection details and project permissions appear in separate groups. Test and save actions stay visible while you scroll; the desktop app’s **Interface** switches apply immediately.

The bottom-left control in the AI composer shows the current conversation’s capabilities. **Default scope** reads referenced repository context and reads and edits the referenced workflow. For file changes, enable **AI project delivery** in **Settings → AI service**, reference exactly one repository in the chat, then choose **Default scope → Repository read/write**. There’s no second repository picker. **Learn more** shows the local path, AI provider, and file access rules. Send requests in the same chat and review proposals before saving. Ordinary questions and workflow edits still work. Changing repository references restores the default scope; new chats and page reloads do not inherit the authorization. A generated PowerShell entry can also be saved to local startup settings after explicit trust. Saving does not run the script, stage changes, commit, or push.

MeGit binds to `127.0.0.1` and saves workflows locally. Git uses your existing configuration and credentials. An AI provider receives task context only when you use a configured AI feature.

On Windows, open **Local service** in a repository's details to approve an existing npm script or a repository PowerShell script. Start, stop, or restart the managed foreground service and read its output directly in the terminal panel. An optional TCP port enables readiness and conflict checks; MeGit does not stop unrelated listeners or launch services automatically.

Click the repository name on a canvas card to open its details. Once a local service is configured, a circular button sits halfway in a semicircular notch near the upper-right side of the current HEAD card. The button is green for Start and red for Stop, and shares the card's blue outline when selected. Hovering shows a tooltip without changing the button's appearance or size. While the service runs, elapsed time appears above the card, to the left of the Stop button, without resizing the card. It shows `02:03:04` until one full day has elapsed, then includes days (for example, `01d 02:03:04`). The timer updates every second, continues across page refreshes, and resets when the service restarts. Errors appear on the card; Restart, configuration, and full output stay in the Local service panel.

See the [local service script specification](docs/LOCAL_SERVICE_SCRIPTS.md) for entry rules and working npm and PowerShell examples.

Each active service has its own terminal tab on the left side of the workflow footer. Select a tab to open that repository's terminal directly. Save and check details are under **Status information** on the right.

## Development

`npm run dev` starts the app. `npm run check` runs the project checks; `npm run test:e2e` runs the Edge scenarios.

[User guide (简体中文)](README.zh-CN.md) · [Architecture](docs/ARCHITECTURE.md) · [Design system](docs/DESIGN_SYSTEM.md)
