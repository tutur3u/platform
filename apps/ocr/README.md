# OCR Service (`apps/ocr`)

FastAPI microservice that extracts a student name and 7 digit ID from
captured ID card images. It uses PaddleOCRVL running on CPU, cleans the
recognized text, and exposes one `POST /capture` endpoint that frontend
apps (for example `apps/web` via `src/app/api/capture/route.ts`) can call.

## Purpose

- Provide a thin, inspectable OCR layer that the web experience or any
	other client can call over HTTP.
- Keep OCR specific dependencies (PaddleOCR, OpenCV, NumPy) inside a
	dedicated Python workspace so the rest of the monorepo stays on
	Bun/Next.js tooling.
- Normalize noisy OCR output by removing keywords (RMIT markers, month
	names) and formatting uppercase names before returning
	`{ "name": string, "studentNumber": string }`.

## Folder structure

Key files in `apps/ocr`:

- `app.py` – FastAPI application and `/capture` endpoint.
- `extraction.py` – regex-based extraction and cleaning of OCR text.
- `parser.py` – helpers to parse raw PaddleOCR results into text.
- `deployment.py` – Modal serverless deployment definition.
- `pyproject.toml` – project metadata and dependencies (Python 3.12).
- `uv.lock` – lockfile for deterministic installs when using `uv`.
- `.venv/` – local virtual environment (not committed).
- `tests/` – unit tests for parsing and extraction.

## Tech stack

| Area | Details |
| --- | --- |
| API | FastAPI + Uvicorn with permissive CORS configured in `app.py`. |
| OCR | `PaddleOCRVL(device="cpu")` from PaddleOCR/PaddlePaddle, confidence filtered at 0.5 and executed in a worker thread. |
| Image processing | OpenCV (`cv2`) + NumPy arrays created from base64 encoded frames sent by the client. |
| Data cleaning | Regex based extraction that strips reserved keywords/months before matching a name + 7 digit ID (`extraction.py`, `parser.py`). |
| Packaging | `pyproject.toml` + `uv.lock` define runtime and dev dependencies for Python 3.12. |
| Deployment | Modal serverless with image defined in `deployment.py`, 2 CPU / 2 GB RAM, up to 100 concurrent invocations. |

## API contract

`POST /capture`

```jsonc
// Request body
{ "image_data": "data:image/png;base64,..." }

// Success
{ "name": "John Doe", "studentNumber": "1234567" }

// Fallback when no confident match is found
{
	"error": "No match found in the provided ID data",
	"extracted_text": "raw ocr text",
	"debug": true
}
```

Errors are returned as FastAPI `HTTPException`s (400 for bad input,
500 for unexpected failures). The Next.js proxy at
`apps/web/src/app/api/capture/route.ts` simply forwards client payloads
to this endpoint.

## Local development

### Prerequisites

- Python 3.12 (matches `pyproject.toml`).
- uv (recommended for managing Python dependencies and virtual environments).

### Setup

1. From the repo root (optional, for JS apps):
	 - `bun install`
2. Enter the OCR workspace:
	 - `cd apps/ocr`
3. Install Python packages (use one of the following):
	 - `uv sync`
6. Start the dev server:
	 - `uv run uvicorn app:app --host 127.0.0.1 --port 5500 --reload`

The service listens on `http://127.0.0.1:5500`. Web clients should set
`OCR_SERVICE_URL=http://127.0.0.1:5500` (see `.env` usage in
`turbo.json` and the web app) so their proxy route forwards to the
local server.

## Modal deployment

`deployment.py` defines the deployment image and app:

- Base image: Debian slim with `libgl1-mesa-glx` and `libglib2.0-0` added.
- Installs everything from `pyproject.toml` using `pip_install_from_pyproject`.
- Copies local source (`app`, `extraction`, etc.) into the image.
- Exposes `fastapi_app` via `@modal.asgi_app()` with 2 CPU, 2 GB RAM, `max_inputs=100` concurrency.

Typical workflow (all commands run from `apps/ocr`):

1. Ensure dependencies are installed locally (see setup above).
2. `modal run deployment.py` – run one-off tasks or debugging.
3. `modal serve deployment.py` – run the FastAPI app locally through
	 Modal tunnels.
4. `modal deploy deployment.py` – deploy the app to Modal’s cloud and
	 obtain the public URL.

Ensure Modal credentials are available via `MODAL_TOKEN_ID` and
`MODAL_TOKEN_SECRET` (listed in `turbo.json` `globalEnv`). After
deployment, set `OCR_SERVICE_URL` to the Modal endpoint so consuming
apps hit the hosted service.

## Troubleshooting

- **Virtual env missing**: make sure `.venv` is created and activated
	before running any Python commands.
- **OCR accuracy**: adjust regex patterns or excluded keywords in
	`extract_info` inside `extraction.py` for other document formats.
- **OpenCV display errors**: install desktop OpenCV deps
	(`libgl1-mesa-glx`, `libglib2.0-0`) or run inside Modal where they
	are already included.
- **Modal auth**: run `modal token new` locally, then export
	`MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` before invoking
	`modal run/serve/deploy`.

With these steps you can iterate locally, proxy requests from the
Next.js app during development, and deploy the OCR microservice to
Modal when ready.
