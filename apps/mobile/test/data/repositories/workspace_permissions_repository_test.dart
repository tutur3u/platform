import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';

void main() {
  group('WorkspacePermissions', () {
    test('grants permission for workspace creators', () {
      const permissions = WorkspacePermissions(
        permissions: <String>{},
        isCreator: true,
      );

      expect(
        permissions.containsPermission(manageTimeTrackingRequestsPermission),
        isTrue,
      );
      expect(
        permissions.withoutPermission(manageTimeTrackingRequestsPermission),
        isFalse,
      );
    });

    test('grants permission for admin role', () {
      const permissions = WorkspacePermissions(
        permissions: <String>{'admin'},
        isCreator: false,
      );

      expect(
        permissions.containsPermission(manageTimeTrackingRequestsPermission),
        isTrue,
      );
    });

    test('grants permission for direct permission', () {
      const permissions = WorkspacePermissions(
        permissions: <String>{manageTimeTrackingRequestsPermission},
        isCreator: false,
      );

      expect(
        permissions.containsPermission(manageTimeTrackingRequestsPermission),
        isTrue,
      );
    });

    test('denies permission when user lacks access', () {
      const permissions = WorkspacePermissions(
        permissions: <String>{'manage_projects'},
        isCreator: false,
      );

      expect(
        permissions.containsPermission(manageTimeTrackingRequestsPermission),
        isFalse,
      );
      expect(
        permissions.withoutPermission(manageTimeTrackingRequestsPermission),
        isTrue,
      );
    });
  });
}
