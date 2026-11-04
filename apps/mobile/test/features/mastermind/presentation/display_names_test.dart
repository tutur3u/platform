import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

Lane _lane({required String title, String role = 'Child lane'}) => Lane(
  id: 'item-${'c' * 20}',
  title: title,
  role: role,
  state: LaneState.running,
  providerModel: 'claude / claude-sonnet-5-5',
  ageSeconds: null,
  etaSeconds: null,
);

NeedsYou _item(String title, {ItemKind? kind}) => NeedsYou(
  id: 'item-${'d' * 20}',
  title: title,
  body: '',
  options: const [],
  recommendedOption: null,
  state: ItemState.open,
  versionHash: 'a' * 64,
  kind: kind,
);

void main() {
  final en = AppLocalizationsEn();
  final vi = AppLocalizationsVi();

  group('laneDisplayName', () {
    test('keeps the hub [Name] Role title verbatim', () {
      expect(
        laneDisplayName(en, _lane(title: '[Atlas] Mastermind')),
        '[Atlas] Mastermind',
      );
      expect(namedTitle('[Atlas] Mastermind'), (
        name: 'Atlas',
        role: 'Mastermind',
      ));
    });

    test('names a standing role instead of the redacted triple', () {
      expect(
        laneDisplayName(
          en,
          _lane(title: 'Mastermind · hub · lane', role: 'Browser Operator'),
        ),
        'Browser Operator',
      );
    });

    test('names a child lane by product and area', () {
      expect(
        laneDisplayName(en, _lane(title: 'Tuturuuu · hub · lane')),
        'Tuturuuu hub',
      );
    });

    test('keeps a real title that only looks dotted', () {
      expect(isRedactedTitle('Fix · the · thing'), isFalse);
      expect(
        laneDisplayName(en, _lane(title: 'Fix · the · thing')),
        'Fix · the · thing',
      );
    });
  });

  group('itemDisplayTitle', () {
    test('turns a redacted triple into a sentence, in both languages', () {
      final item = _item(
        'Mastermind · hub · decision',
        kind: ItemKind.decision,
      );
      expect(itemDisplayTitle(en, item), 'Decision for Mastermind hub');
      expect(itemDisplayTitle(vi, item), 'Quyết định cho Mastermind hub');
    });

    test('keeps a written title', () {
      expect(itemDisplayTitle(en, _item('Review plan')), 'Review plan');
    });
  });

  group('modelShortName', () {
    test('shortens known families and hides unknown models', () {
      expect(modelShortName(en, 'claude / claude-sonnet-5-5'), 'Sonnet 5.5');
      expect(modelShortName(en, 'codex / gpt-6.1-sol'), 'GPT-6.1 sol');
      expect(modelShortName(en, 'Unknown model'), 'Model not reported');
      expect(modelShortName(en, 'unknown'), 'Model not reported');
      expect(modelShortName(en, 'local / mystery-1'), 'mystery-1');
    });
  });
}
