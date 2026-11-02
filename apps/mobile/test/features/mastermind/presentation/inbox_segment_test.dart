import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/iris/iris_flag.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';

void main() {
  tearDown(() => debugOverrideMastermindIris(enabled: null));

  for (final iris in [false, true]) {
    test('Needs you is the default with Iris ${iris ? 'on' : 'off'}', () {
      debugOverrideMastermindIris(enabled: iris);
      expect(defaultInboxSegment, InboxSegment.needsYou);
      expect(inboxSegmentFromQuery(null), InboxSegment.needsYou);
      expect(inboxLocation(), '/mastermind/inbox');
    });
  }

  test('Chat stays available and explicit with Iris on', () {
    debugOverrideMastermindIris(enabled: true);
    expect(availableInboxSegments.first, InboxSegment.chat);
    expect(inboxSegmentFromQuery('chat'), InboxSegment.chat);
    expect(
      inboxLocation(segment: InboxSegment.chat),
      '/mastermind/inbox?segment=chat',
    );
  });

  test('?tier= round-trips for every tier', () {
    for (final tier in InboxTier.values) {
      final location = inboxLocation(tier: tier);
      expect(location, '/mastermind/inbox?tier=${tier.queryValue}');
      expect(
        inboxTierFromQuery(Uri.parse(location).queryParameters['tier']),
        tier,
      );
    }
  });

  test('unknown tiers parse to null and tiers ride only with Needs you', () {
    expect(inboxTierFromQuery('nope'), isNull);
    expect(inboxTierFromQuery(null), isNull);
    expect(
      inboxLocation(segment: InboxSegment.resolved, tier: InboxTier.urgent),
      '/mastermind/inbox?segment=resolved',
    );
  });

  test('?q= round-trips on ask segments and is dropped elsewhere', () {
    final location = inboxLocation(
      tier: InboxTier.fyi,
      search: ' deploy atlas ',
    );
    expect(
      inboxSearchFromQuery(Uri.parse(location).queryParameters['q']),
      'deploy atlas',
    );
    expect(Uri.parse(location).queryParameters['tier'], 'fyi');
    expect(inboxSearchFromQuery('   '), isNull);
    expect(inboxLocation(search: ''), '/mastermind/inbox');
    expect(
      inboxLocation(segment: InboxSegment.decisions, search: 'x'),
      '/mastermind/inbox?segment=decisions',
    );
    expect(
      inboxLocation(segment: InboxSegment.resolved, search: 'x'),
      '/mastermind/inbox?segment=resolved&q=x',
    );
  });
}
