import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app.dart';
import 'package:mobile/core/config/app_flavor.dart';

void main() {
  group('App', () {
    test('can be instantiated', () {
      expect(
        () => const App(appFlavor: AppFlavor.development),
        returnsNormally,
      );
    });
  });
}
