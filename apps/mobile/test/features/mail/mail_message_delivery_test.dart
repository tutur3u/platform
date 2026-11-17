import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_message_delivery.dart';

void main() {
  test('RFC date fallback respects the sender offset', () {
    final sent = mailSentDate({
      'sentAt': 'invalid',
      'safeHeaders': {'date': 'Tue, 17 Nov 2026 20:30:00 +0700'},
    });
    expect(sent?.toUtc(), DateTime.utc(2026, 11, 17, 13, 30));
  });

  test('valid sent timestamp takes precedence over the raw header', () {
    final sent = mailSentDate({
      'sentAt': '2026-11-17T15:00:00Z',
      'safeHeaders': {'date': 'Tue, 17 Nov 2026 20:30:00 +0700'},
    });
    expect(sent?.toUtc(), DateTime.utc(2026, 11, 17, 15));
  });

  test('received row has a sixty second distinction boundary', () {
    final message = <String, dynamic>{
      'sentAt': '2026-11-17T13:30:00Z',
      'receivedAt': '2026-11-17T13:30:59Z',
    };
    expect(mailDistinctReceivedDate(message), isNull);
    message['receivedAt'] = '2026-11-17T13:31:00Z';
    expect(
      mailDistinctReceivedDate(message)?.toUtc(),
      DateTime.utc(2026, 11, 17, 13, 31),
    );
    message.remove('sentAt');
    expect(mailDistinctReceivedDate(message), isNotNull);
  });

  test('malformed dates do not roll into a different day', () {
    for (final date in [
      null,
      '',
      'bad date',
      '2026-02-30T13:30:00Z',
      '2026-11-17T25:30:00Z',
      '2026-11-17T20:60:00Z',
      '2026-11-17T20:30:60Z',
      '2026-11-17T20:30:00+07:60',
      'Tue, 31 Nov 2026 20:30:00 +0700',
      'Tue, 17 Nov 2026 25:30:00 +0700',
      'Tue, 17 Nov 2026 20:30:00 +0760',
    ]) {
      expect(parseMailDeliveryDate(date), isNull, reason: '$date');
    }
  });
}
