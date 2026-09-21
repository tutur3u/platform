import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_live_config.dart';

void main() {
  test('new sessions use Gemini 3.8 Live', () {
    expect(assistantLiveModelId, 'gemini-3.8-live');
    expect(assistantLiveModelMatches('models/gemini-3.8-live'), isTrue);
  });

  group('assistantLiveModelMatches', () {
    test('matches bare live model id', () {
      expect(
        assistantLiveModelMatches('gemini-3.1-flash-live-preview'),
        isTrue,
      );
    });

    test('matches provider-prefixed live model id', () {
      expect(
        assistantLiveModelMatches('google/gemini-3.1-flash-live-preview'),
        isTrue,
      );
    });

    test('rejects non-live models', () {
      expect(
        assistantLiveModelMatches('google/gemini-3.1-flash-lite'),
        isFalse,
      );
    });
  });
}
