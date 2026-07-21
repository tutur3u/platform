import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/time_tracker/utils/duration.dart';

void main() {
  group('formatTimerDuration', () {
    test('uses the provided invalid label for negative durations', () {
      expect(
        formatTimerDuration(
          const Duration(seconds: -1),
          invalidDurationLabel: 'Invalid duration',
        ),
        'Invalid duration',
      );
    });

    test('formats non-negative durations using compact units', () {
      expect(
        formatTimerDuration(
          const Duration(hours: 2, minutes: 3, seconds: 4),
          invalidDurationLabel: 'Invalid duration',
        ),
        '2h 3m',
      );
      expect(
        formatTimerDuration(
          const Duration(minutes: 3, seconds: 4),
          invalidDurationLabel: 'Invalid duration',
        ),
        '3m 4s',
      );
      expect(
        formatTimerDuration(
          const Duration(seconds: 4),
          invalidDurationLabel: 'Invalid duration',
        ),
        '4s',
      );
    });
  });
}
