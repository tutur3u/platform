# AGENTS.md - Discord Python Playbook

This file contains Python/Discord-specific rules for `apps/discord`.
Global repo rules still apply from the root `AGENTS.md`.

## 1. Tooling & Dependencies

- **Package Manager**: Use `uv` as the local environment/package workflow (`uv sync`, `uv run ...`) with `pyproject.toml` + `uv.lock` as the source of truth for local development.
- **CI Parity**: Keep the GitHub Actions workflow `.github/workflows/discord-python-ci.yml` aligned with the `uv` workflow and install dependencies via `uv sync --locked` so CI reproducibly uses `apps/discord/uv.lock`.

## 2. Logging Standards

- **Module-Level Logging**: Use module-level `logging` (`logger.exception` / `logger.error(..., exc_info=True)`) for error paths.
- **Avoid print()**: Do not use ad-hoc `print()` for operational failures.