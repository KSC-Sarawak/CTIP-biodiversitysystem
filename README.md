# Smart Ground-Truthing and Digital Biodiversity System

COS30049 Computing Technology Innovation Project (Swinburne Sarawak), built with
NeuonAI Sdn Bhd and Sarawak Forestry Corporation. Pilot site: Niah National Park.

A digital replacement for paper-based plant documentation: a botanist field app that
works offline, a web knowledge system for conservation officers, a security layer, and
an IoT node that protects endangered specimens.

## Repository layout

| Path | What it is |
|---|---|
| `apps/mobile` | Botanist Field App (React Native + Expo SDK 58, Android only) |
| `apps/web` | Officer, Admin and Visitor web interfaces (React + Vite) |
| `apps/shared` | Code shared by the web and mobile apps (API client, store, design tokens, search) |
| `apps/firmware` | ESP32 sensor node (Arduino IDE sketch) |
| `services/api` | REST API (Node + Express), deployed on Render |
| `services/anomaly-detection` | Sensor anomaly detection (Python) |
| `packages/api-contract` | OpenAPI spec, the single source of truth for the API |
| `supabase` | Supabase CLI project: `config.toml`, SQL migrations (tables, RLS policies, storage) |
| `infra` | Mosquitto broker config |
| `docs` | Architecture notes and diagrams (`docs/architecture`, including `offline-sync.md`) and testing evidence (`docs/testing`) |

## Prerequisites

- Node.js 24 and npm
- Python 3 (for anomaly detection). Use `python`, not `python3`, on Windows
- For the mobile app: Android Studio (Android SDK, platform tools and an emulator at
  API 30 or higher), or an Android phone with Expo Go for SDK 58
- Arduino IDE with the ESP32 board package (for firmware only)

## Getting started

Install everything once from the repository root, then run each app from the root
(PowerShell). `npm run help` lists every script.

```powershell
npm run install:all   # root, web, mobile and API dependencies

npm run web           # web portal at http://localhost:5173
npm run mobile        # Expo dev server (phone on the same Wi-Fi)
npm run mobile:tunnel # Expo over a tunnel (phone on any network)
npm run api           # API in watch mode at http://localhost:8000
```

Each app also has its own `package.json`, so `cd apps/mobile` then `npm start` works too.

The web and mobile apps call the deployed Render API by default, so you do not need to
run the API locally to work on them. The first request after the Render service has been
idle can take up to a minute.

Never commit `.env` files, Supabase keys or MQTT certificates. Copy values from the
team's shared secrets instead.

## Mobile app

### Run it on the Android emulator

1. In Android Studio, open **Virtual Device Manager** and create a device with a Google
   Play system image at API 30 or higher (the app's `minSdkVersion` is 30).
2. In the emulator's settings, set the back camera to **VirtualScene** or **Webcam0** so
   the QR scanner has something to scan. Set a GPS location under
   **Extended Controls > Location**.
3. Start the emulator, then pick one of these:

```powershell
cd apps/mobile

# Quick UI review: installs Expo Go on the emulator and opens the app
npx expo start --android

# Native development build: needed for anything offline-related, because
# Expo Go has no SQLCipher and the local database is not encrypted there
npx expo run:android
```

`npx expo run:android` generates `apps/mobile/android/` (ignored by git), builds it with
Gradle and installs it. Open that folder in Android Studio for Logcat and the debugger.
Later, start Metro with `npx expo start --dev-client`.

The emulator shares your computer's internet connection, so the Render API works as is.
To use an API running on your own computer instead, run
`$env:EXPO_PUBLIC_API_URL = "http://10.0.2.2:8000"` in PowerShell before starting Expo
(`10.0.2.2` is the emulator's address for your computer). Use the emulator's airplane-mode toggle to test offline mode.

If a native build fails with "path too long" on Windows, run
`git config --global core.longpaths true`, enable Windows long paths
(`LongPathsEnabled`), and restart.

### Build an APK

The app version is `1.0.<commit count>` (see `scripts/version.mjs`); the build scripts
stamp it for you.

**On EAS (recommended, the shared signing key).** Needs an Expo account with access to
the project. From the repository root:

```powershell
npx eas-cli login
npm run mobile:build:apk                            # "preview" profile
npm run mobile:build:apk -- --profile production    # "production" profile
```

When the build finishes, EAS prints a link to download the `.apk`. Use these builds for
the release test in `docs/testing/offline-mode-test.md`.

**Locally with Gradle (no Expo account).**

```powershell
cd apps/mobile
npx expo prebuild --platform android
cd android
.\gradlew assembleRelease
```

The APK is at `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
Install it with `adb install -r <path to apk>` or drag it onto the emulator. It is
signed with a local debug key, so it cannot update an APK built on EAS (uninstall that
first) and must not be handed out as a release.

`npm run mobile:build:apk:local` also builds with EAS on your own computer, but EAS local
builds only run on Linux or macOS, so on Windows run it inside WSL.

## Task tracking

Sprint backlog lives in Jira, project **CTIP**: https://kampungsemuacina.atlassian.net.
Each workstream has a starting ticket (CTIP-13 to CTIP-18); pick one up in the team
chat or standup, and it gets assigned to you in Jira. New work within a workstream
goes to whoever owns it, unless it's raised otherwise.

## Contributing

- Branch per task, named after the Jira issue key, for example
  `feature/CTIP-15-local-sqlite-schema`.
- Commit messages start with the issue key, for example
  `CTIP-15: add specimen recording form`.
- Never push to `main`. Open a PR; it needs at least one approval and passing CI.
  Changes to `packages/api-contract/` need two approvals.
- Pull `main` before branching and keep branches short-lived.
