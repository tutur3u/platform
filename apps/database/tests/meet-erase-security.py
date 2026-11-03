"""Source contract checks complement executed pgTAP privileges and lease tests."""
from pathlib import Path
import re
import unittest
ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / 'supabase/migrations/20261103130000_meet_erase_core.sql').read_text()
RB = (ROOT / 'rollbacks/20261103130000_meet_erase_core.rollback.sql').read_text()
class Security(unittest.TestCase):
    def test_writes(self):
        self.assertEqual(re.findall(r'grant (?:[^;]*,)?(?:insert|update|delete|truncate)[^;]* to service_role;', SQL), [])
    def test_rollback(self):
        guard = RB.split('drop function')[0]
        for table in re.findall(r'create table private\.(\w+)', SQL):
            self.assertIn('lock table private.' + table, guard)
            self.assertIn('from private.' + table, guard)
    def test_settlement(self):
        self.assertIn('create function private.settle_meet_erase_apply', SQL)
        self.assertIn('MEET_ERASE_RECONCILIATION_REQUIRED', SQL.split('create function private.admit_meet_erase_apply')[1].split('end $$')[0])
    def test_canonical(self):
        self.assertIn('private.meet_erase_canonical_json(expected)', SQL)
if __name__ == '__main__':
    unittest.main()
