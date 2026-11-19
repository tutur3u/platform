import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/utils/crm_visibility.dart';

void main() {
  const source = {
    'id': 'customer',
    'full_name': 'Synthetic customer',
    'email': 'synthetic@example.invalid',
    'note': 'Synthetic private note',
    'attendance_count': 4,
  };
  test('pending fields cannot undo public-only permission redaction', () {
    final row = crmVisibleRow(
      source,
      const CrmUserPermissions(
        hasPrivateInfo: false,
        hasPublicInfo: true,
        canCheckUserAttendance: false,
      ),
    );
    expect(row, {'id': 'customer', 'full_name': 'Synthetic customer'});
    expect(source['note'], 'Synthetic private note');
  });
  test('private-only permission does not restore public identity', () {
    final row = crmVisibleRow(
      source,
      const CrmUserPermissions(
        hasPrivateInfo: true,
        hasPublicInfo: false,
        canCheckUserAttendance: true,
      ),
    );
    expect(row.containsKey('full_name'), isFalse);
    expect(row['email'], 'synthetic@example.invalid');
    expect(row['attendance_count'], 4);
  });
  test('missing server permission metadata fails closed', () {
    expect(crmVisibleRow(source, null), {'id': 'customer'});
  });

  test('linked accounts stay public and parse onto the contact', () {
    const linked = {
      'id': 'customer',
      'ws_id': 'ws',
      'full_name': 'Synthetic customer',
      'linked_users': [
        {'id': 'platform-1', 'display_name': 'Platform User'},
      ],
    };
    final visible = crmVisibleRow(
      linked,
      const CrmUserPermissions(
        hasPrivateInfo: false,
        hasPublicInfo: true,
        canCheckUserAttendance: false,
      ),
    );
    expect(visible['linked_users'], isNotNull);
    final hidden = crmVisibleRow(
      linked,
      const CrmUserPermissions(
        hasPrivateInfo: true,
        hasPublicInfo: false,
        canCheckUserAttendance: false,
      ),
    );
    expect(hidden.containsKey('linked_users'), isFalse);
    final user = CrmUser.fromJson(linked);
    expect(user.linkedUsers.single.label, 'Platform User');
    expect(
      crmVisibleUser(
        user,
        const CrmUserPermissions(
          hasPrivateInfo: false,
          hasPublicInfo: false,
          canCheckUserAttendance: false,
        ),
      ).linkedUsers,
      isEmpty,
    );
  });
}
