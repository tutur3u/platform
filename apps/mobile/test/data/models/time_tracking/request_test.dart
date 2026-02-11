import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/request.dart';

void main() {
  group('approvalStatusFromString', () {
    test('parses uppercase API values', () {
      expect(approvalStatusFromString('APPROVED'), ApprovalStatus.approved);
      expect(approvalStatusFromString('REJECTED'), ApprovalStatus.rejected);
      expect(approvalStatusFromString('NEEDS_INFO'), ApprovalStatus.needsInfo);
      expect(approvalStatusFromString('PENDING'), ApprovalStatus.pending);
    });

    test('falls back to pending for unknown values', () {
      expect(approvalStatusFromString('unknown'), ApprovalStatus.pending);
      expect(approvalStatusFromString(null), ApprovalStatus.pending);
    });
  });
}
