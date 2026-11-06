import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/workspace_management_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/settings/view/workspace_role_permission_catalog.dart';

void main() {
  test('role payload drops explicit grants from a mixed payload', () {
    for (final enabled in [true, false]) {
      expect(
        workspaceRolePermissionPayload({
          manageMastermindPermission: enabled,
          'manage_finance': true,
          'view_infrastructure': false,
        }),
        [
          {'id': 'manage_finance', 'enabled': true},
          {'id': 'view_infrastructure', 'enabled': false},
        ],
      );
    }
  });

  test('role payload is empty when only explicit grants are set', () {
    expect(
      workspaceRolePermissionPayload({manageMastermindPermission: true}),
      isEmpty,
    );
  });

  test('role editor catalog never lists explicit grants', () {
    final catalogIds = {
      for (final group in workspacePermissionCatalog) ...group.permissions,
    };
    expect(explicitGrantPermissions, isNotEmpty);
    expect(catalogIds.intersection(explicitGrantPermissions), isEmpty);
  });
}
