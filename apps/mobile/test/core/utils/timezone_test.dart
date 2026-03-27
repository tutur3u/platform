import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/utils/timezone.dart';

void main() {
  group('isLikelyIanaTimezoneIdentifier', () {
    test('accepts IANA timezone identifiers', () {
      expect(isLikelyIanaTimezoneIdentifier('Asia/Ho_Chi_Minh'), isTrue);
      expect(isLikelyIanaTimezoneIdentifier('America/New_York'), isTrue);
    });

    test('rejects offset and abbreviation timezone labels', () {
      expect(isLikelyIanaTimezoneIdentifier('+07'), isFalse);
      expect(isLikelyIanaTimezoneIdentifier('GMT+07:00'), isFalse);
      expect(isLikelyIanaTimezoneIdentifier('ICT'), isFalse);
    });
  });
}
