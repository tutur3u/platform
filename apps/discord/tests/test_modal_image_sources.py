"""The Modal image must ship every local module that app.py imports."""

import ast
from pathlib import Path

DISCORD_DIR = Path(__file__).resolve().parents[1]
LOCAL_MODULES = {path.stem for path in DISCORD_DIR.glob("*.py")}


def imported_local_modules(path: Path) -> set[str]:
    """Top-level and function-scoped imports of sibling modules."""
    found: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names = [alias.name.split(".")[0] for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            names = [node.module.split(".")[0]]
        else:
            continue
        found.update(name for name in names if name in LOCAL_MODULES)
    return found


def local_import_closure(entrypoint: str) -> set[str]:
    pending, seen = [entrypoint], set()
    while pending:
        module = pending.pop()
        for dependency in imported_local_modules(DISCORD_DIR / f"{module}.py"):
            if dependency not in seen:
                seen.add(dependency)
                pending.append(dependency)
    seen.discard(entrypoint)
    return seen


def image_local_sources(path: Path) -> set[str]:
    sources: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "add_local_python_source"
        ):
            sources.update(
                arg.value
                for arg in node.args
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str)
            )
    return sources


def test_image_ships_every_transitively_imported_local_module() -> None:
    required = local_import_closure("app")
    shipped = image_local_sources(DISCORD_DIR / "app.py")
    assert {"commands", "error_reporting"} <= required
    assert required - shipped == set()


def test_image_lists_only_existing_local_modules() -> None:
    shipped = image_local_sources(DISCORD_DIR / "app.py")
    assert shipped - LOCAL_MODULES == set()
