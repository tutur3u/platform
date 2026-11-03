"""Migration dependency order is a release contract, including future V9 SQL."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
class Order(unittest.TestCase):
    def test_order(self):
        files = list((ROOT / 'supabase/migrations').glob('*.sql'))
        def stamp(suffix):
            found = [p.name[:14] for p in files if p.name.endswith(suffix)]
            self.assertEqual(len(found), 1)
            return found[0]
        v4 = stamp('_meet_content_fences.sql')
        v2 = stamp('_meet_erase_settings_and_holds.sql')
        v10 = stamp('_meet_erase_core.sql')
        self.assertLess(v4, v2)
        self.assertLess(v2, v10)
        for path in files:
            if ('ledger' in path.name or 'v9' in path.name.lower()) and 'meet' in path.name:
                self.assertGreater(path.name[:14], v10)

if __name__ == '__main__':
    unittest.main()
