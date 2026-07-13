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
DOCS_PAGES = (
    "build/development-tools/codex-plugin",
    "build/skills/overview",
    "build/skills/installation",
)
MARKETPLACE_NAME = "tuturuuu"
PLUGIN_NAME = "tuturuuu"
CLAUDE_MARKETPLACE_PATH = ".claude-plugin/marketplace.json"
SKILLS_SH_CONFIG = "skills.sh.json"
MAX_DEFAULT_PROMPT_LENGTH = 120
PROMPT_COVERAGE_PATTERNS = {
    "tuturuuu-platform": re.compile(r"\bplatform\b", re.IGNORECASE),
    "tuturuuu-browser-vercel-debugging": re.compile(
        r"\b(browser|Vercel|production troubleshooting)\b", re.IGNORECASE
    ),
    "tuturuuu-commit": re.compile(r"\b(commit|scope|domain)\b", re.IGNORECASE),
    "tuturuuu-cli": re.compile(r"\b(cli|sdk|ttr)\b", re.IGNORECASE),
    "tuturuuu-cli-tasks": re.compile(
        r"\b(ttr task|ttr tasks|tasks?)\b", re.IGNORECASE
    ),
    "tuturuuu-cli-finance": re.compile(
        r"\b(finance|wallets?|transactions?|budgets?)\b", re.IGNORECASE
    ),
    "tuturuuu-agent-coordination": re.compile(
        r"\b(coordinate|coordination|shared worktree|handoff|overlap)\b",
        re.IGNORECASE,
    ),
    "tuturuuu-development-tooling": re.compile(
        r"\b(development workflow|tooling|future agents?)\b", re.IGNORECASE
    ),
    "tuturuuu-devbox-ops": re.compile(
        r"\b(devbox|runner|box agent|box setup)\b", re.IGNORECASE
    ),
    "tuturuuu-validation-offload": re.compile(
        r"\b(offload|heavy validation|devbox validation)\b", re.IGNORECASE
    ),
    "tuturuuu-web-release": re.compile(
        r"\b(release badge|version badge|release metadata|web release)\b",
        re.IGNORECASE,
    ),
    "tuturuuu-mobile-task-board": re.compile(
        r"\b(flutter|mobile|task-board|task board)\b", re.IGNORECASE
    ),
    "tuturuuu-database": re.compile(r"\b(supabase|schema|api)\b", re.IGNORECASE),
    "tuturuuu-ci-docs": re.compile(r"\b(ci|docs?|workflow)\b", re.IGNORECASE),
    "tuturuuu-review-comments": re.compile(
        r"\b(review comments?|review threads?|pr comments?)\b", re.IGNORECASE
    ),
    "tuturuuu-pr-merge-sync": re.compile(
        r"\b(merge PR|main green|sync PR|production sync)\b", re.IGNORECASE
    ),
    "tuturuuu-cms-studio": re.compile(
        r"\b(CMS|landing-page|content management|external project)\b",
        re.IGNORECASE,
    ),
    "tuturuuu-satellite-app-ux": re.compile(
        r"\b(satellite app|app-session|workspace navigation|standalone app)\b",
        re.IGNORECASE,
    ),
    "tuturuuu-e2e-auth-debugging": re.compile(
        r"\b(E2E auth|dev-session|auth redirect|local E2E)\b",
        re.IGNORECASE,
    ),
    "tuturuuu-external-apps": re.compile(
        r"\b(external app|app-token|direct uploads?|content delivery)\b",
        re.IGNORECASE,
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
    skill_dirs = get_skill_dirs(plugin_root)
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


def get_skill_dirs(plugin_root: Path) -> list[Path]:
    skills_root = plugin_root / "skills"
    if not skills_root.is_dir():
        fail(f"missing skills directory at {skills_root}")
    return sorted(path for path in skills_root.iterdir() if path.is_dir())


def get_skill_names(plugin_root: Path) -> list[str]:
    return [path.name for path in get_skill_dirs(plugin_root)]


def validate_public_claude_manifest(repo_root: Path, plugin_root: Path) -> None:
    manifest_path = repo_root / CLAUDE_MARKETPLACE_PATH
    if not manifest_path.exists():
        fail(f"missing public plugin marketplace at {manifest_path}")

    manifest_text = read_text(manifest_path)
    check_no_todo(manifest_path, manifest_text)
    check_no_machine_paths(manifest_path, manifest_text)
    try:
        payload = json.loads(manifest_text)
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {manifest_path}: {exc}")

    if payload.get("metadata", {}).get("pluginRoot") != "./plugins":
        fail(f"{manifest_path} metadata.pluginRoot must be ./plugins")

    plugins = payload.get("plugins")
    if not isinstance(plugins, list):
        fail(f"{manifest_path} plugins must be an array")

    matching_entries = [
        entry
        for entry in plugins
        if isinstance(entry, dict) and entry.get("name") == PLUGIN_NAME
    ]
    if len(matching_entries) != 1:
        fail(f"{manifest_path} must contain exactly one {PLUGIN_NAME} entry")

    entry = matching_entries[0]
    if entry.get("source") != "./tuturuuu":
        fail(f"{manifest_path} {PLUGIN_NAME} source must be ./tuturuuu")

    expected_skills = [f"./skills/{name}" for name in get_skill_names(plugin_root)]
    actual_skills = entry.get("skills")
    if actual_skills != expected_skills:
        fail(f"{manifest_path} {PLUGIN_NAME} skills must match plugin skill folders")

    for skill_path in expected_skills:
        resolved = plugin_root / skill_path.removeprefix("./")
        if not (resolved / "SKILL.md").exists():
            fail(f"{manifest_path} references missing skill directory {resolved}")


def validate_skills_sh_config(repo_root: Path, plugin_root: Path) -> None:
    config_path = repo_root / SKILLS_SH_CONFIG
    if not config_path.exists():
        fail(f"missing skills.sh config at {config_path}")

    config_text = read_text(config_path)
    check_no_todo(config_path, config_text)
    check_no_machine_paths(config_path, config_text)
    try:
        payload = json.loads(config_text)
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {config_path}: {exc}")

    if payload.get("$schema") != "https://skills.sh/schemas/skills.sh.schema.json":
        fail(f"{config_path} $schema must point to the skills.sh schema")
    if payload.get("notGrouped") != "bottom":
        fail(f'{config_path} notGrouped must be "bottom"')

    groupings = payload.get("groupings")
    if not isinstance(groupings, list) or not groupings:
        fail(f"{config_path} groupings must be a non-empty array")

    grouped_skills: list[str] = []
    for index, grouping in enumerate(groupings):
        if not isinstance(grouping, dict):
            fail(f"{config_path} groupings[{index}] must be an object")
        if not isinstance(grouping.get("title"), str) or not grouping["title"].strip():
            fail(f"{config_path} groupings[{index}].title must be a non-empty string")
        skills = grouping.get("skills")
        if not isinstance(skills, list) or not skills:
            fail(f"{config_path} groupings[{index}].skills must be a non-empty array")
        for skill_name in skills:
            if not isinstance(skill_name, str) or not skill_name.strip():
                fail(f"{config_path} groupings[{index}].skills contains an invalid name")
            grouped_skills.append(skill_name)

    duplicates = sorted(
        {skill_name for skill_name in grouped_skills if grouped_skills.count(skill_name) > 1}
    )
    if duplicates:
        fail(f"{config_path} contains duplicate skills: {', '.join(duplicates)}")

    expected_skills = get_skill_names(plugin_root)
    if sorted(grouped_skills) != expected_skills:
        fail(f"{config_path} groupings must include every Tuturuuu skill exactly once")


def require_text(path: Path, text: str, expected: str) -> None:
    if expected not in text:
        fail(f"{path} is missing {expected}")


def validate_commit_no_verify_guidance(
    repo_root: Path, plugin_root: Path, manifest: dict
) -> None:
    commit_skill_path = plugin_root / "skills" / "tuturuuu-commit" / "SKILL.md"
    commit_reference_path = (
        plugin_root
        / "skills"
        / "tuturuuu-commit"
        / "references"
        / "commit-workflow.md"
    )
    plugin_docs_path = (
        repo_root / "apps" / "docs" / "build" / "development-tools" / "codex-plugin.mdx"
    )
    git_docs_path = (
        repo_root
        / "apps"
        / "docs"
        / "build"
        / "development-tools"
        / "git-conventions.mdx"
    )

    commit_skill_text = read_text(commit_skill_path)
    for expected in (
        "proof-gated no-verify evidence",
        "git commit --no-verify",
        "exact staged files would pass the checks normally covered by `bun check`",
        "If ownership is unclear, proof is incomplete, or affected checks",
    ):
        require_text(commit_skill_path, commit_skill_text, expected)

    commit_reference_text = read_text(commit_reference_path)
    for expected in (
        "## Proof-Gated No-Verify",
        "git status --short",
        "git diff --cached --stat",
        "git diff --cached --name-only",
        "separated checks run, mapped to the affected `bun check` components",
        "skipped `bun check` components listed with path-based rationale",
        "`bun check:mobile` coverage included when staged or touched paths include",
        "can justify `--no-verify` before",
    ):
        require_text(commit_reference_path, commit_reference_text, expected)

    for docs_path in (plugin_docs_path, git_docs_path):
        docs_text = read_text(docs_path)
        for expected in (
            "proof-gated no-verify",
            "git commit --no-verify",
            "`bun check:mobile`",
        ):
            require_text(docs_path, docs_text, expected)

    interface = manifest.get("interface", {})
    long_description = interface.get("longDescription", "")
    if "proof-gated no-verify commit evidence" not in long_description:
        fail("manifest interface.longDescription must mention proof-gated no-verify")

    capabilities = interface.get("capabilities", [])
    if "Proof-gated no-verify commits" not in capabilities:
        fail("manifest interface.capabilities must mention proof-gated no-verify")


def validate_docs(repo_root: Path) -> None:
    docs_json_path = repo_root / "apps" / "docs" / "docs.json"
    if not docs_json_path.exists():
        fail(f"missing docs navigation at {docs_json_path}")

    for page in DOCS_PAGES:
        docs_page_path = repo_root / "apps" / "docs" / f"{page}.mdx"
        if not docs_page_path.exists():
            fail(f"missing plugin docs page at {docs_page_path}")

    try:
        docs_payload = json.loads(read_text(docs_json_path))
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {docs_json_path}: {exc}")

    def contains_page(value: object, page: str) -> bool:
        if value == page:
            return True
        if isinstance(value, list):
            return any(contains_page(item, page) for item in value)
        if isinstance(value, dict):
            return any(contains_page(item, page) for item in value.values())
        return False

    for page in DOCS_PAGES:
        if not contains_page(docs_payload, page):
            fail(f"{docs_json_path} does not register {page}")


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


def validate_browser_vercel_guidance(
    repo_root: Path, plugin_root: Path, manifest: dict
) -> None:
    skill_path = (
        plugin_root
        / "skills"
        / "tuturuuu-browser-vercel-debugging"
        / "SKILL.md"
    )
    reference_path = skill_path.parent / "references" / "production-debugging-playbook.md"
    docs_path = (
        repo_root / "apps" / "docs" / "build" / "development-tools" / "codex-plugin.mdx"
    )

    skill_text = read_text(skill_path)
    for expected in (
        "Keep production browser and Vercel work read-only by default.",
        "Do not use `vercel deploy`",
        "**Verified in production:**",
        "references/production-debugging-playbook.md",
    ):
        require_text(skill_path, skill_text, expected)

    reference_text = read_text(reference_path)
    for expected in (
        "vercel inspect <production-domain>",
        "vercel logs --project <project>",
        "## Common Tuturuuu Failure Signatures",
        "## Performance And Cost",
        "## Product Improvement Checklist",
        "Satellite API returns 401",
        "Satellite API returns 404",
    ):
        require_text(reference_path, reference_text, expected)

    require_text(docs_path, read_text(docs_path), "$tuturuuu-browser-vercel-debugging")
    capabilities = manifest.get("interface", {}).get("capabilities", [])
    if "Browser and Vercel troubleshooting" not in capabilities:
        fail("manifest capabilities must mention browser and Vercel troubleshooting")


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
    validate_commit_no_verify_guidance(repo_root, plugin_root, manifest)
    validate_ci(repo_root)
    validate_marketplace(repo_root)
    validate_browser_vercel_guidance(repo_root, plugin_root, manifest)
    validate_public_claude_manifest(repo_root, plugin_root)
    validate_skills_sh_config(repo_root, plugin_root)
    validate_no_todo_under(plugin_root)
    validate_portable_text_under(plugin_root)
    print(f"OK: validated {plugin_root}")


if __name__ == "__main__":
    main()
