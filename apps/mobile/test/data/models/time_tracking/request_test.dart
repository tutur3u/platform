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

  group('mergeTimeTrackingRequestPreservingUserEnrichment', () {
    test('keeps owner display and avatar when fresh omits user join', () {
      final previous = TimeTrackingRequest(
        id: 'r1',
        userId: 'u1',
        title: 'Old',
        userDisplayName: 'Sam',
        userAvatarUrl: 'https://example.com/a.png',
        startTime: DateTime.utc(2026, 2, 24, 8),
        endTime: DateTime.utc(2026, 2, 24, 9),
      );
      final fresh = TimeTrackingRequest(
        id: 'r1',
        userId: 'u1',
        title: 'New title',
        startTime: DateTime.utc(2026, 2, 24, 10),
        endTime: DateTime.utc(2026, 2, 24, 11),
      );

      final merged = mergeTimeTrackingRequestPreservingUserEnrichment(
        previous,
        fresh,
      );

      expect(merged.title, 'New title');
      expect(merged.userDisplayName, 'Sam');
      expect(merged.userAvatarUrl, 'https://example.com/a.png');
    });

    test('prefers fresh user fields when present', () {
      const previous = TimeTrackingRequest(
        id: 'r1',
        userDisplayName: 'Old',
        userAvatarUrl: 'https://old',
      );
      const fresh = TimeTrackingRequest(
        id: 'r1',
        userDisplayName: 'New',
        userAvatarUrl: 'https://new',
      );

      final merged = mergeTimeTrackingRequestPreservingUserEnrichment(
        previous,
        fresh,
      );

      expect(merged.userDisplayName, 'New');
      expect(merged.userAvatarUrl, 'https://new');
    });

    test('allows mutable fields to be cleared to null', () {
      final previous = TimeTrackingRequest(
        id: 'r1',
        taskId: 'task-1',
        approvedBy: 'manager-1',
        approvedByName: 'Manager',
        approvedAt: DateTime.utc(2026, 2, 24, 12),
        rejectionReason: 'Old reason',
      );
      const fresh = TimeTrackingRequest(
        id: 'r1',
      );

      final merged = mergeTimeTrackingRequestPreservingUserEnrichment(
        previous,
        fresh,
      );

      expect(merged.taskId, isNull);
      expect(merged.approvedBy, isNull);
      expect(merged.approvedByName, isNull);
      expect(merged.approvedAt, isNull);
      expect(merged.rejectionReason, isNull);
    });
  });
}
