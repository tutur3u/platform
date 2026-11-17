import errno
import unittest
from unittest.mock import MagicMock, patch

import fixture


class CanaryTests(unittest.TestCase):
    def test_only_unreachable_counts(self):
        for error in [None, errno.ECONNREFUSED, errno.ETIMEDOUT, errno.ENETUNREACH]:
            socket = MagicMock()
            if error is not None:
                socket.__enter__.return_value.connect.side_effect = OSError(error, 'synthetic')
            with self.subTest(error=error), patch.dict('os.environ', {}, clear=True), \
                    patch('fixture.os.path.exists', return_value=False), \
                    patch('fixture.socket.socket', return_value=socket):
                if error == errno.ENETUNREACH:
                    self.assertEqual(fixture.probe()['status'], 'SYNTHETIC_CANARIES_PASSED')
                else:
                    with self.assertRaises(RuntimeError):
                        fixture.probe()

    def test_environment_leak_stops_before_network(self):
        with patch.dict('os.environ', {'SYNTHETIC_CANARY': '1'}, clear=True), \
                patch('fixture.socket.socket') as socket:
            with self.assertRaises(RuntimeError):
                fixture.probe()
            socket.assert_not_called()
