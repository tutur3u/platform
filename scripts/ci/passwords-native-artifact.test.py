import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("passwords_artifact", Path(__file__).with_name("passwords-native-artifact.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreviewEnvironment(unittest.TestCase):
    def test_removes_only_exact_synthetic_public_build_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dist/server/.dev.vars"
            path.parent.mkdir(parents=True)
            values = {
                "NEXT_PUBLIC_SUPABASE_URL": "https://passwords-ci.supabase.invalid",
                "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_passwords_ci_placeholder",
            }
            path.write_text("\n".join(key + "=" + json.dumps(value) for key, value in values.items()))
            module.prepare(directory)
            self.assertFalse(path.exists())

    def test_refuses_unknown_values_and_private_keys_without_removing_file(self):
        for content in ['ENCRYPTION_MASTER_KEY="synthetic-secret"', 'NEXT_PUBLIC_SUPABASE_URL="https://other.invalid"', 'malformed']:
            with self.subTest(content=content), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "dist/server/.dev.vars"
                path.parent.mkdir(parents=True)
                path.write_text(content)
                with self.assertRaises(ValueError) as raised:
                    module.prepare(directory)
                self.assertNotIn("synthetic-secret", str(raised.exception))
                self.assertEqual(path.read_text(), content)

    def test_refuses_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dist/server/.dev.vars"
            path.parent.mkdir(parents=True)
            target = Path(directory) / "fixture"
            target.write_text("synthetic")
            path.symlink_to(target)
            with self.assertRaises(ValueError):
                module.prepare(directory)
            self.assertTrue(path.is_symlink())
            self.assertEqual(target.read_text(), "synthetic")


if __name__ == "__main__":
    unittest.main()
