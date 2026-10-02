import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/offline_api_pacer.dart';

void main() {
  test(
    'early timer wakes cannot dispatch at 749ms; the minimum remains 750ms',
    () async {
      var elapsed = Duration.zero;
      final delays = <Duration>[];
      final started = <Duration>[];
      final pacer = OfflineApiPacer(
        elapsed: () => elapsed,
        delay: (duration) async {
          delays.add(duration);
          elapsed += delays.length == 1
              ? const Duration(milliseconds: 749)
              : duration;
        },
      );
      await pacer.run(() async {
        started.add(elapsed);
      });
      await pacer.run(() async {
        started.add(elapsed);
      });
      expect(elapsed, const Duration(milliseconds: 750));
      expect(started, [Duration.zero, const Duration(milliseconds: 750)]);
      expect(delays, [
        const Duration(milliseconds: 750),
        const Duration(milliseconds: 1),
      ]);
    },
  );

  test(
    'slow responses already beyond the interval need no extra cooldown',
    () async {
      var elapsed = Duration.zero;
      final delays = <Duration>[];
      final pacer = OfflineApiPacer(
        elapsed: () => elapsed,
        delay: (duration) async => delays.add(duration),
      );
      await pacer.run(() async {});
      elapsed = const Duration(seconds: 2);
      await pacer.run(() async {});
      expect(delays, isEmpty);
    },
  );
}
