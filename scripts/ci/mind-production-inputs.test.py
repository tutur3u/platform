"""Mind cutover public inputs: empty vars fail, fixtures stay on qualification."""
import hashlib
import importlib.util
import json
import os
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/mind-cloudflare.yaml"
SPEC = importlib.util.spec_from_file_location(
    "apps_artifact", Path(__file__).with_name("apps-native-artifact.py")
)
ARTIFACT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ARTIFACT)

MIND_FIXTURE_URL = "https://mind-ci.supabase.invalid"
MIND_FIXTURE_KEY = "sb_publishable_mind_ci_placeholder"
MIND_FIXTURE_DIGEST = "14ca95fffabb573bf6c432e36be78ab3a7c007ed93a9fdbd6356ba8a8ae44645"
REAL_URL = "https://project.supabase.co"
REAL_KEY = "sb_publishable_real"


def job_slice(text, name, following):
    start = text.index(f"\n  {name}:\n")
    end = text.index(f"\n  {following}:\n") if following else len(text)
    return text[start:end]


def guard_script(cutover):
    marker = "name: Require real production public inputs for a production artifact\n"
    start = cutover.index(marker)
    run_at = cutover.index("run: |\n", start)
    lines = cutover[run_at + len("run: |\n"):].splitlines()
    body = []
    for line in lines:
        if line.startswith("          "):
            body.append(line[10:])
            continue
        break
    if not body:
        raise AssertionError("cutover guard script is missing")
    return "\n".join(body) + "\n"


def run_guard(script, url_var, key_var, resolved_url, resolved_key):
    return subprocess.run(
        ["bash", "-c", script],
        env={
            **os.environ,
            "PRODUCTION_SUPABASE_URL_VAR": url_var,
            "PRODUCTION_SUPABASE_PUBLISHABLE_KEY_VAR": key_var,
            "NEXT_PUBLIC_SUPABASE_URL": resolved_url,
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": resolved_key,
        },
        text=True,
        capture_output=True,
        check=False,
    )


def independent_digest(url, key):
    payload = json.dumps([url, key], separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(payload).hexdigest()


class MindProductionInputsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = WORKFLOW.read_text()
        cls.native = job_slice(cls.workflow, "native", "mind-cutover-artifact")
        cls.cutover = job_slice(cls.workflow, "mind-cutover-artifact", None)
        cls.script = guard_script(cls.cutover)

    def test_native_qualification_keeps_its_fixture_inputs(self):
        self.assertIn(MIND_FIXTURE_URL, self.native)
        self.assertIn(MIND_FIXTURE_KEY, self.native)
        self.assertNotIn(MIND_FIXTURE_URL, self.cutover)
        self.assertNotIn(MIND_FIXTURE_KEY, self.cutover)
        self.assertIn("vars.PRODUCTION_SUPABASE_URL", self.cutover)
        self.assertIn("vars.PRODUCTION_SUPABASE_PUBLISHABLE_KEY", self.cutover)
        self.assertNotIn("|| 'https://", self.cutover)

    def test_cutover_bakes_the_apex_app_url(self):
        self.assertEqual(self.cutover.count("https://tuturuuu.com/mind"), 2)
        self.assertNotIn("https://mind.tuturuuu.com", self.cutover)
        self.assertNotIn("https://tuturuuu.com/mind/", self.cutover)
        self.assertIn("NEXT_PUBLIC_WEB_APP_URL: https://tuturuuu.com", self.cutover)
        self.assertIn("https://mind.tuturuuu.com", self.native)

    def test_empty_production_vars_fail_closed(self):
        cases = [
            ("", "", "", ""),
            (REAL_URL, "", REAL_URL, ""),
            ("", REAL_KEY, "", REAL_KEY),
        ]
        for url_var, key_var, resolved_url, resolved_key in cases:
            with self.subTest(url_var=url_var, key_var=key_var):
                result = run_guard(self.script, url_var, key_var, resolved_url, resolved_key)
                self.assertEqual(result.returncode, 1)
                self.assertIn("no fixture fallback", result.stdout)
                self.assertNotIn(REAL_URL, result.stdout)
                self.assertNotIn(REAL_KEY, result.stdout)

    def test_fixture_values_fail_even_when_present(self):
        result = run_guard(
            self.script,
            MIND_FIXTURE_URL,
            MIND_FIXTURE_KEY,
            MIND_FIXTURE_URL,
            MIND_FIXTURE_KEY,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Fixture Supabase URL refused", result.stdout)

    def test_resolved_inputs_must_equal_the_production_vars(self):
        result = run_guard(self.script, REAL_URL, REAL_KEY, MIND_FIXTURE_URL, REAL_KEY)
        self.assertEqual(result.returncode, 1)
        self.assertIn("production vars exactly", result.stdout)

    def test_real_production_vars_pass_and_match_the_artifact_digest(self):
        result = run_guard(self.script, REAL_URL, REAL_KEY, REAL_URL, REAL_KEY)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        env = {
            "NEXT_PUBLIC_SUPABASE_URL": REAL_URL,
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": REAL_KEY,
        }
        sealed = ARTIFACT.public_inputs_digest(env)
        self.assertEqual(sealed, independent_digest(REAL_URL, REAL_KEY))
        self.assertEqual(
            ARTIFACT.public_inputs_digest(
                {
                    "NEXT_PUBLIC_SUPABASE_URL": MIND_FIXTURE_URL,
                    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": MIND_FIXTURE_KEY,
                }
            ),
            MIND_FIXTURE_DIGEST,
        )
        self.assertNotEqual(sealed, MIND_FIXTURE_DIGEST)
        self.assertIn("publicInputsSha256 does not match the exact production build inputs", self.cutover)


if __name__ == "__main__":
    unittest.main()
