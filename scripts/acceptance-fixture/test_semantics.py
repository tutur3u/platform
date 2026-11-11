import copy
import unittest
from semantics import verify


class ContractTests(unittest.TestCase):
    def setUp(self):
        # Independent toy protocol, deliberately unrelated to Supabase cookies.
        self.contract = {'handler': 'fixture.logout-all',
                         'effects': ['revoke-fixture-session', 'delete-fixture-device'],
                         'headers': [('X-Fixture', 'one'), ('X-Fixture', 'two')],
                         'deletions': [('fixture-session', '/', None),
                                       ('fixture-device', '/', 'fixture.invalid')]}

    def test_positive(self):
        self.assertEqual(verify(copy.deepcopy(self.contract), self.contract), 'SYNTHETIC_CONTRACT_ONLY')

    def test_wrong_handler_and_alias_cannot_pass_on_status(self):
        for handler in ['fixture.logout', 'fixture.alias', None]:
            observed = copy.deepcopy(self.contract)
            observed['handler'] = handler
            with self.assertRaises(ValueError):
                verify(observed, self.contract)

    def test_missing_cookie_effect_is_failure(self):
        observed = copy.deepcopy(self.contract)
        observed['deletions'] = []
        with self.assertRaises(ValueError):
            verify(observed, self.contract)

    def test_collapsed_or_reordered_headers_fail(self):
        for headers in [[('X-Fixture', 'one, two')], [('X-Fixture', 'two'), ('X-Fixture', 'one')]]:
            observed = copy.deepcopy(self.contract)
            observed['headers'] = headers
            with self.assertRaises(ValueError):
                verify(observed, self.contract)

    def test_wrong_cookie_scope_fails(self):
        observed = copy.deepcopy(self.contract)
        observed['deletions'][1] = ('fixture-device', '/other', None)
        with self.assertRaises(ValueError):
            verify(observed, self.contract)

    def test_missing_backend_effect_fails(self):
        observed = copy.deepcopy(self.contract)
        observed['effects'].pop()
        with self.assertRaises(ValueError):
            verify(observed, self.contract)


if __name__ == '__main__':
    unittest.main()
