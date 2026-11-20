<p align="center">
  <img src="public/brand/megit-logo.svg" width="250" alt="MeGit">
</p>

<p align="center"><strong>A visual Git workbench for multi-repository workflows</strong></p>
<p align="center">Map dependencies, verify what has landed, and inspect local Git history from one board.</p>

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

- **Workflow canvas** — Group repositories, map dependencies and release steps, and export boards as SVG or PNG.
- **Integration checks** — See which source commits are missing from a target. Open the connection to inspect the comparison.
- **Connection shortcuts** — Pending push (blue, right) and pull (green, left) are visible without hovering when they can run. If a direction has no pending commits, its shortcut appears in gray on hover or keyboard focus and cannot be activated. Pull status reflects the last fetch. For two local repositories, edit the connection and enable fast-forward integration to move source commits into the checked-out target. Every action shows its direction and requires confirmation; the connection remains a comparison entry point.
- **Git workbench** — Compare with the trunk or view the latest commit’s diff using the buttons beside each branch label. Stage changes, commit, and manage branches and remotes in the same workbench.
- **Optional AI assistant** — Ask about selected repositories, draft commit messages, and review proposed actions before applying them.

## Quick start

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

## Product gallery

### AI assistant

![Floating AI chat with UI Library and Web App selected as references](docs/screenshots/ai-assistant.png)

*Demo conversation: two repository references, a release-readiness question, and a suggested next step.*

| Branch map | Integration comparison |
| :---: | :---: |
| [![Branch map showing forks, a merge, and HEAD](docs/screenshots/branch-map.png)](docs/screenshots/branch-map.png) | [![Comparison showing four missing commits and their ancestry](docs/screenshots/integration.png)](docs/screenshots/integration.png) |

<details>
<summary>Git visual classroom and dark mode</summary>

**Git visual classroom** — Step through a merge without touching a repository.

![Interactive Git lesson showing two branch histories joining](docs/screenshots/git-classroom.png)

**Dark mode** — The same release board in the dark theme.

![MeGit release workflow in dark mode](docs/screenshots/workflow-dark.png)

</details>

## Local by default

MeGit binds to `127.0.0.1` and saves boards locally. Git uses your existing configuration and credentials. An AI provider receives task context only when you use a configured AI feature.

## Development

`npm run dev` starts the app. `npm run check` runs the project checks; `npm run test:e2e` runs the Edge scenarios.

[User guide (简体中文)](README.zh-CN.md) · [Architecture](docs/ARCHITECTURE.md) · [Design system](docs/DESIGN_SYSTEM.md)
