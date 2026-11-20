# README screenshots

The gallery uses the running application in Microsoft Edge with English UI and temporary fictional Git repositories. Light mode is used for the main gallery; the same workflow is also captured in dark mode.

To regenerate from the repository root in PowerShell:

```powershell
$env:MEGIT_CAPTURE_README = '1'
$env:MEGIT_E2E_PORT = '49473'
$env:MEGIT_E2E_DATA_DIR = '.megit/readme-showcase-state'
$env:MEGIT_E2E_OUTPUT = '.megit/readme-showcase-results'
npm run test:e2e -- e2e/readme-showcase.spec.ts
```

Review the six PNGs in `.megit/readme-capture/`, then copy them into this directory. The AI assistant capture uses a scripted conversation and does not contact an AI provider. Use the isolated data directory above, not your regular workspace.
