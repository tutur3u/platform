"""Source contracts supplement the executable pgTAP and catalog replay."""
from pathlib import Path
import re
import unittest
ROOT = Path(__file__).resolve().parents[3]
M = ROOT / 'apps/database/supabase/migrations'
forward = (M / '20261103112400_meet_content_fences.sql').read_text()
rollback = (ROOT / 'apps/database/rollbacks/20261103112400_meet_content_fences.rollback.sql').read_text()
def reserve(sql):
    return re.search(r'create or replace function public.reserve_meet_ai_chunk\(.*?\$\$;', sql, re.S)[0]
class Composition(unittest.TestCase):
    def test_merged(self):
        f = reserve(forward)
        self.assertEqual(forward.count('create or replace function public.reserve_meet_ai_chunk('), 1)
        self.assertIn("session.protocol <> 'legacy'", f)
        self.assertIn('and stream_id is null', f)
        self.assertIn('erasure_generation = f.generation', f)
    def test_exact_rollback(self):
        self.assertEqual(reserve(rollback), reserve(next(M.glob('20261103082000*')).read_text()))
    def test_lock_order(self):
        for sql in [forward, rollback]:
            lock = re.search(r'lock table (.*?) in access exclusive mode;', sql, re.S)[1]
            self.assertLess(lock.index('public.meet_ai_sessions'), lock.index('public.meet_ai_chunks'))
            self.assertLess(lock.index('public.meet_ai_chunks'), lock.index('private.meeting_documents'))
    def test_v10_guard(self):
        self.assertIn("to_regclass('private.meet_erasure_operations')", rollback)
        self.assertIn('V10 is installed; roll forward', rollback)
if __name__ == '__main__': unittest.main()
