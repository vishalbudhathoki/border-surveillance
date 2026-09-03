# BorderLens — Border Surveillance Command Center

This repository contains a Django API in `backend/` and a Next.js command-center UI in `frontend/`. The local API stores demo state in `backend/.localdata/`; that directory and all credentials/model weights are intentionally ignored by Git.

## Prerequisites

- Python 3.12 or newer. This project standardizes on Python 3.12+ for its Django environment; `backend/requirements-web.txt` installs Django 5.2.
- Node.js with npm. Install the current LTS from [nodejs.org](https://nodejs.org/en/download).
- A plain local filesystem path. Do not place the project in iCloud Drive Desktop/Documents on macOS or OneDrive Desktop/Documents on Windows. Use `/Users/<your-user>/dev/` or `C:\dev\` instead; cloud sync can cause SQLite's `unable to open database file` error.

The checked-in setup files are `backend/requirements-ai.txt`, `backend/requirements-services.txt`, `backend/requirements-web.txt`, `backend/.env.example`, `frontend/package.json`, `frontend/package-lock.json`, and `frontend/.env.example`.

## macOS setup (zsh or bash)

Install Homebrew from [brew.sh](https://brew.sh/) if it is not already installed, then install Python 3.12 and Node.js:

```bash
brew install python@3.12 node
```

Use Homebrew's Python 3.12 binary explicitly:

```bash
cd ~/dev/border-surveillance-main/backend
PYTHON_BIN="$(brew --prefix python@3.12)/bin/python3.12"
"$PYTHON_BIN" --version
"$PYTHON_BIN" -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
for requirements_file in requirements-*.txt; do
  python -m pip install -r "$requirements_file"
done
cp .env.example .env
python manage.py check
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8000
```

In a new Terminal window, start the frontend:

```bash
cd ~/dev/border-surveillance-main/frontend
cp .env.example .env.local
npm ci
npm run build
npm run dev
```

Open <http://localhost:3000>. The Django API is available at <http://127.0.0.1:8000/api/health>.

On Apple Silicon, `AI_DEVICE=cuda` or `AI_DEVICE=auto` resolves to CUDA when available, then Apple MPS, then CPU. Use `AI_DEVICE=cpu` when a model does not support MPS.

## Windows setup (PowerShell)

Install Python from [python.org](https://www.python.org/downloads/) or with [WinGet](https://learn.microsoft.com/en-us/windows/package-manager/winget/), and install Node.js with:

```powershell
winget install OpenJS.NodeJS.LTS
```

Keep the project under a plain path such as `C:\dev\border-surveillance-main`, then run:

```powershell
cd C:\dev\border-surveillance-main\backend
py -3.12 --version
py -3.12 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
Get-ChildItem requirements-*.txt | Sort-Object Name | ForEach-Object { python -m pip install -r $_.FullName }
Copy-Item .env.example .env
python manage.py check
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8000
```

In a new PowerShell window, start the frontend:

```powershell
cd C:\dev\border-surveillance-main\frontend
Copy-Item .env.example .env.local
npm ci
npm run build
npm run dev
```

Open <http://localhost:3000>. If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once and activate again with `.\venv\Scripts\Activate.ps1`.

## Verification commands

From the repository root, the backend test suite can be run without pytest:

```bash
backend/venv/bin/python -m unittest discover -s backend/tests -t . -v
```

The equivalent PowerShell command is:

```powershell
backend\venv\Scripts\python.exe -m unittest discover -s backend\tests -t . -v
```

The production frontend check is `npm run build` from `frontend/`. It performs TypeScript checking, linting, and static page generation.

## Local configuration

Copy the examples before editing values:

- `backend/.env.example` contains Django, CORS, Firebase, blockchain, and AI settings. Keep Firebase credentials and the blockchain signer private key on the backend only.
- `frontend/.env.example` contains only `NEXT_PUBLIC_API_BASE_URL`. The browser should never receive backend secrets.

The local AI endpoint accepts JPEG frames at `POST /api/inference/frame`. Model weights are runtime assets, not repository files. Set `PERSON_MODEL_PATH`, `FACE_MODEL_PATH`, `ANPR_VEHICLE_MODEL_PATH`, and `ANPR_PLATE_MODEL_PATH` to approved local weights when using the inference endpoint. If `FACE_MODEL_PATH` is empty or missing, the local preview uses OpenCV's bundled frontal-face cascade so face boxes still appear; configure an approved YOLO face weight when higher accuracy is required. If `ANPR_PLATE_MODEL_PATH` is missing, ANPR keeps the general vehicle model and runs OCR over detected vehicle regions as a fallback.

The `/live-feed` page has a `VIDEO SOURCE` control with three options:

- `DEVICE CAMERA` requests a camera after the operator clicks enable.
- `VIDEO FILE` accepts a video from the Mac/PC and analyzes it frame by frame in the browser.
- `CCTV / IP URL` accepts a browser-playable `http://` or `https://` video endpoint. The camera must allow browser CORS access when the Django API and camera are on different origins.

Raw `rtsp://`/`rtsps://` addresses cannot be decoded by a normal browser video element. Put an HLS/WebRTC relay such as MediaMTX or go2rtc in front of the camera, then enter the relay's HTTP(S) URL in the live-feed control.

The `/login` page uses rank-based console access. The local demo accounts are:

- `ADMIN-001` / `BL-ADMIN-2026`: administrator access, including guard provisioning.
- `SSB-2041` / `BL-COMMAND-2041`: command access.
- `SSB-2098` / `BL-FIELD-2098`: field access.

After signing in as `ADMIN-001`, open `CAMERA SETTINGS` from the sidebar. The `GUARD REGISTRY // CREDENTIAL PROVISIONING` form creates a guard profile and a hashed login credential in the backend's local state. The new operator ID and passcode can then be used at `/login`; password hashes are never returned in API snapshots. Access is enforced by a signed backend token for guard creation, while the browser route guard controls which console pages each rank can open.

The Border Map uses a custom SVG renderer rather than Leaflet or Mapbox GL. Its `SATELLITE VIEW` toggle places the public Esri World Imagery export underneath the existing camera, alert, guard, sector, and tripwire overlays. This is a periodic/static imagery basemap for geographic context, not a live satellite or surveillance video feed. Esri imagery attribution is shown in the map UI. No API key is required for this demo endpoint.

The live pipeline supports:

- `AI_FACE_FRAME_INTERVAL=3`: run face detection every third pipeline frame.
- `AI_ANPR_FRAME_INTERVAL=5`: run plate detection every fifth pipeline frame.
- `AI_INFERENCE_MAX_DIM=960`: resize only oversized model inputs and scale boxes back to the original frame coordinates. The larger default preserves more detail for small plates.

## Troubleshooting

### Django starts with the wrong Python version

Do not use an older system `python3` or an existing venv created from it. Confirm `python --version` is 3.12+, remove the old `backend/venv` and recreate it with Homebrew's `python@3.12` binary on macOS or `py -3.12` on Windows. Reinstall all three `requirements-*.txt` files.

### `sqlite3.OperationalError: unable to open database file`

The database is `backend/.localdata/django.sqlite3`. The backend now creates `.localdata` during Django startup, but cloud-synced or unusual paths can still interfere with SQLite file locking. Move the project to `/Users/<your-user>/dev/border-surveillance-main` or `C:\dev\border-surveillance-main`, recreate the venv there, and rerun `migrate`.

### `Unknown command: 'seed_demo'`

Run the commands from `backend/` with the project venv active. The repository includes `backend/app/management/commands/seed_demo.py`; `python manage.py seed_demo` resets local JSON state and writes a small deterministic demo dataset.

### `next: command not found`

Run `npm ci` from `frontend/` before `npm run build` or `npm run dev`. Use the repository's `frontend/package-lock.json` so the installed versions match the checked-in dependency graph.

### AI inference returns 503 or cannot load a model

The API does not download model weights. Install `backend/requirements-ai.txt`, configure the person and ANPR model paths in `backend/.env`, and verify the files exist. Face detection falls back to OpenCV when `FACE_MODEL_PATH` is absent; the live-feed module card will identify that fallback. ANPR falls back to OCR over detected vehicle crops when `ANPR_PLATE_MODEL_PATH` is absent, but a dedicated plate detector is more accurate. The live-feed module card identifies which path is active.

### CCTV URL does not play

The browser only accepts video formats and protocols supported by that browser. Try an H.264 MP4 or browser-compatible HLS URL first. RTSP needs an HLS/WebRTC relay, and a remote camera must return the appropriate CORS header; otherwise the preview cannot draw frames for AI analysis.

### `check --deploy` reports security warnings

`python manage.py check` is the local readiness check. `check --deploy` also warns when production-only settings are not configured: clickjacking middleware, HSTS, HTTPS redirects, a strong secret key, and secure CSRF cookies. Configure those in the deployment environment before exposing Django publicly; the local demo intentionally runs over HTTP.

### npm reports audit warnings

The current lockfile builds successfully, but `npm audit` reports a high PostCSS issue and a critical Next.js issue for the pinned Next.js 14.2.15 dependency. Resolving them requires a major Next.js upgrade according to npm, so test that upgrade separately before using this demo in production.

## API and frontend routes

The main backend routes are `/api/health`, `/api/auth/login`, `/api/bootstrap`, `/api/guards`, `/api/alerts`, `/api/activity`, `/api/guards/<id>`, `/api/cameras/<id>`, `/api/shifts/<id>`, `/api/sync`, `/api/reset`, and `/api/inference/frame`.

The frontend pages are `/`, `/login`, `/dashboard`, `/live-feed`, `/alerts`, `/map`, `/guard-duty`, `/camera-management`, and `/admin`. The legacy `/logistics`, `/intelligence`, and guard-duty detail routes are present redirect pages, so navigation does not point at missing pages.
