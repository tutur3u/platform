import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/security/device_mfa/totp.dart';

void main() {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  test('matches RFC 6238 SHA-1 vectors truncated to six digits', () {
    const vectors = {
      59: '287082',
      1111111109: '081804',
      1111111111: '050471',
      1234567890: '005924',
      2000000000: '279037',
      20000000000: '353130',
    };
    for (final entry in vectors.entries) {
      expect(
        deviceTotp(
          secret,
          DateTime.fromMillisecondsSinceEpoch(entry.key * 1000),
        ),
        entry.value,
      );
    }
  });
  test('changes at the 30-second boundary and rejects invalid secrets', () {
    final before = DateTime.fromMillisecondsSinceEpoch(59999);
    final after = DateTime.fromMillisecondsSinceEpoch(60000);
    expect(deviceTotp(secret, before), isNot(deviceTotp(secret, after)));
    expect(() => deviceTotp('!', before), throwsFormatException);
    expect(() => deviceTotp('', before), throwsFormatException);
  });
}
