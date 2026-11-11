import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('launcher', Path(__file__).with_name('launcher.py'))
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherTests(unittest.TestCase):
    def test_unsupported_platform_never_spawns(self):
        root = Path(__file__).parent
        expected = {name: launcher.digest(root / name) for name in ['fixture.py', 'launcher.py']}
        with patch.object(launcher.platform, 'system', return_value='Darwin'), patch.object(launcher.subprocess, 'Popen') as spawn:
            with self.assertRaises(launcher.Stop):
                launcher.run(expected, 100, 200)
            spawn.assert_not_called()

    def test_changed_source_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['fixture.py', 'launcher.py']:
                (root / name).write_text('synthetic')
            expected = {name: launcher.digest(root / name) for name in ['fixture.py', 'launcher.py']}
            (root / 'fixture.py').write_text('wrong handler')
            with self.assertRaises(launcher.Stop):
                launcher.verify(root, expected)

    def test_no_arbitrary_target(self):
        with self.assertRaises(launcher.Stop):
            launcher.verify(Path('.'), {'next': '0' * 64})

    def test_deadline_admission(self):
        for stage, total in [(0, 1), (1, 0), (5001, 100), (100, 10001)]:
            with self.assertRaises(launcher.Stop):
                launcher.run({}, stage, total)

    def test_namespace_fences_are_mandatory(self):
        args = launcher.command('/usr/bin/bwrap', Path('/fixture'), '/usr/bin/python3')
        for flag in ['--unshare-all', '--die-with-parent', '--new-session', '--clearenv']:
            self.assertIn(flag, args)
        self.assertNotIn('--share-net', args)


if __name__ == '__main__':
    unittest.main()
