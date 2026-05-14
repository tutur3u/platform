#!/usr/bin/env python3
"""Validate the local Tuturuuu Codex plugin."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


FRONTMATTER_RE = re.compile(r"\A---\n(?P<body>.*?)\n---\n", re.DOTALL)
REFERENCE_RE = re.compile(r"`(references/[^`]+)`")
DEFAULT_PROMPT_LINE_RE = re.compile(r"^\s*default_prompt:\s*(?P<value>.+?)\s*$", re.M)
TODO_MARKER = "[TO" + "DO:"
MACHINE_PATH_MARKERS = ["/Us" + "ers/", "Documents/" + "Git" + "Hub/platform"]
WORKFLOW_NAME = "codex-plugin.yaml"
DOCS_PAGE = "build/development-tools/codex-plugin"
MARKETPLACE_NAME = "tuturuuu"
PLUGIN_NAME = "tuturuuu"
MAX_DEFAULT_PROMPT_LENGTH = 120
PROMPT_COVERAGE_PATTERNS = {
    "tuturuuu-platform": re.compile(r"\bplatform\b", re.IGNORECASE),
    "tuturuuu-commit": re.compile(r"\b(commit|scope|domain)\b", re.IGNORECASE),
    "tuturuuu-cli": re.compile(r"\b(cli|sdk|ttr)\b", re.IGNORECASE),
    "tuturuuu-development-tooling": re.compile(
        r"\b(development workflow|tooling|future agents?)\b", re.IGNORECASE
    ),
    "tuturuuu-mobile-task-board": re.compile(
        r"\b(flutter|mobile|task-board|task board)\b", re.IGNORECASE
    ),
    "tuturuuu-database": re.compile(r"\b(supabase|schema|api)\b", re.IGNORECASE),
    "tuturuuu-ci-docs": re.compile(r"\b(ci|docs?|workflow)\b", re.IGNORECASE),
    "tuturuuu-review-comments": re.compile(
        r"\b(review comments?|review threads?|pr comments?)\b", re.IGNORECASE
    ),
}


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def check_no_todo(path: Path, text: str) -> None:
    if TODO_MARKER in text:
        fail(f"{path} still contains TODO placeholders")


def check_no_machine_paths(path: Path, text: str) -> None:
    for marker in MACHINE_PATH_MARKERS:
        if marker in text:
            fail(f"{path} contains machine-specific local path marker: {marker}")


def validate_default_prompt(path: Path, prompt: object) -> str:
    if not isinstance(prompt, str) or not prompt.strip():
        fail(f"{path} has an empty default prompt")

    prompt_text = prompt.strip()
    if len(prompt_text) > MAX_DEFAULT_PROMPT_LENGTH:
        fail(f"{path} default prompt is too long: {prompt_text}")
    if prompt_text.lower().startswith("use $") or "$tuturuuu-" in prompt_text:
        fail(f"{path} default prompt should be a natural user request: {prompt_text}")
    return prompt_text


def parse_quoted_single_line_value(path: Path, field: str, raw_value: str) -> str:
    value = raw_value.strip()
    if not value:
        fail(f"{path} {field} must not be empty")

    quote = value[0]
    if quote not in {"'", '"'}:
        fail(f"{path} {field} must be quoted")

    chars: list[str] = []
    index = 1
    while index < len(value):
        char = value[index]

        if quote == '"' and char == "\\":
            index += 1
            if index >= len(value):
                fail(f"{path} {field} has an unterminated escape sequence")
            chars.append(value[index])
            index += 1
            continue

        if quote == "'" and char == "'" and index + 1 < len(value) and value[index + 1] == "'":
            chars.append("'")
            index += 2
            continue

        if char == quote:
            trailing = value[index + 1 :].strip()
            if trailing:
                fail(f"{path} {field} has trailing content after the closing quote")
            return "".join(chars)

        chars.append(char)
        index += 1

    fail(f"{path} {field} is missing a matching closing quote")


def extract_default_prompt(openai_yaml: Path, openai_text: str) -> str:
    matches = list(DEFAULT_PROMPT_LINE_RE.finditer(openai_text))
    if len(matches) != 1:
        fail(f"{openai_yaml} must contain exactly one default_prompt line")
    return parse_quoted_single_line_value(
        openai_yaml,
        "default_prompt",
        matches[0].group("value"),
    )


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_manifest(plugin_root: Path) -> dict:
    manifest_path = plugin_root / ".codex-plugin" / "plugin.json"
    if not manifest_path.exists():
        fail(f"missing manifest at {manifest_path}")
    try:
        manifest_text = read_text(manifest_path)
        manifest = json.loads(manifest_text)
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {manifest_path}: {exc}")
    check_no_todo(manifest_path, manifest_text)
    return manifest


def parse_frontmatter(skill_file: Path) -> dict[str, str]:
    text = read_text(skill_file)
    check_no_todo(skill_file, text)
    match = FRONTMATTER_RE.match(text)
    if not match:
        fail(f"{skill_file} is missing YAML frontmatter")

    fields: dict[str, str] = {}
    for line in match.group("body").splitlines():
        if not line.strip():
            continue
        if ":" not in line:
            fail(f"{skill_file} has malformed frontmatter line: {line}")
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip()

    for key in ("name", "description"):
        if not fields.get(key):
            fail(f"{skill_file} frontmatter is missing {key}")
    return fields


def validate_manifest(plugin_root: Path, manifest: dict) -> None:
    if manifest.get("name") != PLUGIN_NAME:
        fail(f"manifest name must be {PLUGIN_NAME}")
    if manifest.get("name") != plugin_root.name:
        fail("manifest name must match plugin folder name")
    if manifest.get("skills") != "./skills/":
        fail('manifest "skills" must be "./skills/"')

    interface = manifest.get("interface")
    if not isinstance(interface, dict):
        fail("manifest interface must be an object")

    prompts = interface.get("defaultPrompt")
    if not isinstance(prompts, list) or not prompts:
        fail("manifest interface.defaultPrompt must be a non-empty list")
    if len(prompts) > 8:
        fail("manifest interface.defaultPrompt should stay focused with at most 8 prompts")
    prompt_text = "\n".join(
        validate_default_prompt(plugin_root / ".codex-plugin" / "plugin.json", prompt)
        for prompt in prompts
    )
    for skill_name, pattern in PROMPT_COVERAGE_PATTERNS.items():
        if not pattern.search(prompt_text):
            fail(f"manifest defaultPrompt should include a natural prompt for {skill_name}")

    for field in (
        "displayName",
        "shortDescription",
        "longDescription",
        "developerName",
        "category",
        "brandColor",
    ):
        if not interface.get(field):
            fail(f"manifest interface.{field} must not be empty")

    capabilities = interface.get("capabilities")
    if not isinstance(capabilities, list) or len(capabilities) < 3:
        fail("manifest interface.capabilities must include at least 3 entries")

    for asset_field in ("composerIcon", "logo"):
        asset_path = interface.get(asset_field)
        if not isinstance(asset_path, str) or not asset_path.startswith("./assets/"):
            fail(f"manifest interface.{asset_field} must point to ./assets/")
        if not (plugin_root / asset_path.removeprefix("./")).exists():
            fail(f"manifest interface.{asset_field} points to missing file {asset_path}")


def validate_openai_yaml(skill_dir: Path) -> None:
    openai_yaml = skill_dir / "agents" / "openai.yaml"
    if not openai_yaml.exists():
        fail(f"missing {openai_yaml}")

    openai_text = read_text(openai_yaml)
    check_no_todo(openai_yaml, openai_text)
    for required in ("display_name:", "short_description:", "default_prompt:"):
        if required not in openai_text:
            fail(f"{openai_yaml} is missing {required}")
    validate_default_prompt(openai_yaml, extract_default_prompt(openai_yaml, openai_text))


def validate_reference_links(skill_dir: Path, skill_file: Path) -> None:
    text = read_text(skill_file)
    for match in REFERENCE_RE.finditer(text):
        reference_path = skill_dir / match.group(1)
        if not reference_path.exists():
            fail(f"{skill_file} references missing file {reference_path}")


def validate_skills(plugin_root: Path, manifest: dict) -> None:
    skills_root = plugin_root / "skills"
    if not skills_root.is_dir():
        fail(f"missing skills directory at {skills_root}")

    skill_dirs = sorted(path for path in skills_root.iterdir() if path.is_dir())
    if not skill_dirs:
        fail("plugin must contain at least one skill")

    for skill_dir in skill_dirs:
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            fail(f"missing {skill_file}")
        fields = parse_frontmatter(skill_file)
        if fields["name"] != skill_dir.name:
            fail(f"{skill_file} name does not match folder name")
        if len(fields["description"]) < 80:
            fail(f"{skill_file} description is too short for reliable triggering")

        validate_openai_yaml(skill_dir)
        validate_reference_links(skill_dir, skill_file)


def validate_docs(repo_root: Path) -> None:
    docs_json_path = repo_root / "apps" / "docs" / "docs.json"
    docs_page_path = repo_root / "apps" / "docs" / f"{DOCS_PAGE}.mdx"
    if not docs_json_path.exists():
        fail(f"missing docs navigation at {docs_json_path}")
    if not docs_page_path.exists():
        fail(f"missing plugin docs page at {docs_page_path}")

    try:
        docs_payload = json.loads(read_text(docs_json_path))
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {docs_json_path}: {exc}")

    def contains_page(value: object) -> bool:
        if value == DOCS_PAGE:
            return True
        if isinstance(value, list):
            return any(contains_page(item) for item in value)
        if isinstance(value, dict):
            return any(contains_page(item) for item in value.values())
        return False

    if not contains_page(docs_payload):
        fail(f"{docs_json_path} does not register {DOCS_PAGE}")


def validate_ci(repo_root: Path) -> None:
    workflow_path = repo_root / ".github" / "workflows" / WORKFLOW_NAME
    ci_config_path = repo_root / "tuturuuu.ts"
    if not workflow_path.exists():
        fail(f"missing plugin CI workflow at {workflow_path}")
    if not ci_config_path.exists():
        fail(f"missing CI switchboard at {ci_config_path}")

    workflow_text = read_text(workflow_path)
    check_no_todo(workflow_path, workflow_text)
    for expected in (
        "plugins/tuturuuu/scripts/validate_plugin.py",
        "ci-check.yml",
        f"workflow_name: {WORKFLOW_NAME}",
    ):
        if expected not in workflow_text:
            fail(f"{workflow_path} is missing {expected}")

    if f"'{WORKFLOW_NAME}': true" not in read_text(ci_config_path):
        fail(f"{ci_config_path} does not enable {WORKFLOW_NAME}")


def validate_marketplace(repo_root: Path) -> None:
    marketplace_path = repo_root / ".agents" / "plugins" / "marketplace.json"
    if not marketplace_path.exists():
        fail(f"missing repo plugin marketplace at {marketplace_path}")

    try:
        payload = json.loads(read_text(marketplace_path))
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {marketplace_path}: {exc}")

    if payload.get("name") != MARKETPLACE_NAME:
        fail(f"{marketplace_path} name must be {MARKETPLACE_NAME}")
    if payload.get("interface", {}).get("displayName") != "Tuturuuu":
        fail(f"{marketplace_path} interface.displayName must be Tuturuuu")

    plugins = payload.get("plugins")
    if not isinstance(plugins, list):
        fail(f"{marketplace_path} plugins must be an array")

    matching_entries = [
        entry
        for entry in plugins
        if isinstance(entry, dict) and entry.get("name") == PLUGIN_NAME
    ]
    if len(matching_entries) != 1:
        fail(f"{marketplace_path} must contain exactly one {PLUGIN_NAME} entry")

    entry = matching_entries[0]
    if entry.get("source") != {"source": "local", "path": "./plugins/tuturuuu"}:
        fail(f"{marketplace_path} {PLUGIN_NAME} source must point at ./plugins/tuturuuu")
    if entry.get("policy", {}).get("installation") != "AVAILABLE":
        fail(f"{marketplace_path} {PLUGIN_NAME} policy.installation must be AVAILABLE")
    if entry.get("policy", {}).get("authentication") != "ON_INSTALL":
        fail(f"{marketplace_path} {PLUGIN_NAME} policy.authentication must be ON_INSTALL")
    if entry.get("category") != "Productivity":
        fail(f"{marketplace_path} {PLUGIN_NAME} category must be Productivity")


def validate_no_todo_under(plugin_root: Path) -> None:
    for path in sorted(plugin_root.rglob("*")):
        if not path.is_file():
            continue
        if "__pycache__" in path.parts or path.suffix in {
            ".gif",
            ".jpeg",
            ".jpg",
            ".png",
            ".pyc",
            ".webp",
        }:
            continue
        check_no_todo(path, read_text(path))


def validate_portable_text_under(plugin_root: Path) -> None:
    for path in sorted(plugin_root.rglob("*")):
        if not path.is_file():
            continue
        if "__pycache__" in path.parts or path.suffix in {
            ".gif",
            ".jpeg",
            ".jpg",
            ".png",
            ".pyc",
            ".webp",
        }:
            continue
        check_no_machine_paths(path, read_text(path))


def main() -> None:
    plugin_root = Path(__file__).resolve().parents[1]
    repo_root = plugin_root.parents[1]
    manifest = load_manifest(plugin_root)
    validate_manifest(plugin_root, manifest)
    validate_skills(plugin_root, manifest)
    validate_docs(repo_root)
    validate_ci(repo_root)
    validate_marketplace(repo_root)
    validate_no_todo_under(plugin_root)
    validate_portable_text_under(plugin_root)
    print(f"OK: validated {plugin_root}")


if __name__ == "__main__":
    main()
