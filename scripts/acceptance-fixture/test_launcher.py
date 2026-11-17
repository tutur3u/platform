import json
import subprocess
import unittest
from unittest.mock import patch

import launcher


class AcceptanceTests(unittest.TestCase):
    def test_non_linux_fails_before_launch(self):
        with patch('launcher.platform.system', return_value='Darwin'), \
                patch('launcher.subprocess.run') as spawn:
            with self.assertRaises(launcher.Stop):
                launcher.run()
            spawn.assert_not_called()

    def test_missing_bwrap_fails_closed(self):
        with patch('launcher.platform.system', return_value='Linux'), \
                patch('launcher.shutil.which', return_value=None):
            with self.assertRaises(launcher.Stop):
                launcher.command()

    def test_runner_rejects_failure_and_unexpected_output(self):
        for code, output in [(1, b''), (0, b'{}'), (0, b'x' * 1025),
                             (0, b'not json')]:
            with self.subTest(code=code, output_length=len(output)), \
                    patch('launcher.command', return_value=['synthetic']), \
                    patch('launcher.subprocess.run', return_value=
                          subprocess.CompletedProcess([], code, output)):
                with self.assertRaises(launcher.Stop):
                    launcher.run()

    def test_timeout_is_failure(self):
        with patch('launcher.command', return_value=['synthetic']), \
                patch('launcher.subprocess.run', side_effect=
                      subprocess.TimeoutExpired('synthetic', 5)):
            with self.assertRaises(launcher.Stop):
                launcher.run()

    def test_success_is_explicitly_synthetic(self):
        output = json.dumps({'schema': 1, 'status': 'SYNTHETIC_CANARIES_PASSED'}).encode()
        with patch('launcher.command', return_value=['synthetic']), \
                patch('launcher.subprocess.run', return_value=
                      subprocess.CompletedProcess([], 0, output)) as spawn:
            self.assertEqual(launcher.run()['status'], 'SYNTHETIC_ONLY')
            self.assertEqual(spawn.call_args.kwargs['env'], {})
            self.assertEqual(spawn.call_args.kwargs['timeout'], 5)


if __name__ == '__main__':
    unittest.main()
