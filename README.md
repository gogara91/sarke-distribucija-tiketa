# Sarke Distribucija Tiketa

Desktop Electron app for balancing AT / CH / DE tickets across support agents.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Build Windows app

```bash
npm run dist:win
```

Generated Windows build is created under `release/` as a folder similar to:

`release/sarke-distribucija-tiketa-win32-x64`

Run the app by opening:

`release/sarke-distribucija-tiketa-win32-x64/sarke-distribucija-tiketa.exe`

## Download built app from GitHub

1. Open the repository page on GitHub.
2. Go to **Releases**.
3. Open the latest release.
4. Download the Windows build asset (zip/folder archive).
5. Extract and run `sarke-distribucija-tiketa.exe`.

If you do not see a release yet, build with `npm run dist:win`, archive the output from `release/`, and upload it as a new GitHub Release asset.
