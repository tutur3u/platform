import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/catchup/catchup_session.dart';
import 'package:mobile/features/mastermind/catchup/catchup_visit.dart';

import 'mastermind_home_fixture.dart';

/// The Catch-up contract fixture: every section and kind, a neutral item, a
/// partial coverage, rows with no link and no entity, an off-allowlist link
/// and values this build does not know.
Map<String, dynamic> catchupDigestJson() =>
    jsonDecode(
          File(
            'test/fixtures/mastermind/catchup_digest.json',
          ).readAsStringSync(),
        )
        as Map<String, dynamic>;

/// A Home snapshot carrying the fixture digest.
Map<String, dynamic> homeWithCatchup({Map<String, dynamic>? digest}) =>
    homeJson()..['catchup'] = digest ?? catchupDigestJson();

/// Replaces the shared session so a test starts from a known last visit
/// (null is the first visit). Restores a fresh one afterwards.
CatchupSession useCatchupSession({DateTime? lastVisit}) {
  final store = MemoryCatchupVisitStore(lastVisit);
  final session = CatchupSession(tracker: CatchupVisitTracker(store: store));
  CatchupSession.shared = session;
  addTearDown(() => CatchupSession.shared = CatchupSession());
  return session;
}
