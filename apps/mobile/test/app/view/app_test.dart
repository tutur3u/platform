import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app.dart';

void main() {
  group('App', () {
    test('can be instantiated', () {
      expect(App.new, returnsNormally);
    });
  });
}
