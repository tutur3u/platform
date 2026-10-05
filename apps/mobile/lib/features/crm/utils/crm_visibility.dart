import 'package:mobile/data/models/crm/crm_models.dart';

/// A local queued edit must not restore fields removed by the current server
/// permission snapshot. Missing permission metadata fails closed.
Map<String, dynamic> crmVisibleRow(
  Map<String, dynamic> row,
  CrmUserPermissions? permissions,
) {
  final visible = Map<String, dynamic>.of(row);
  if (!(permissions?.hasPrivateInfo ?? false)) {
    const [
      'email',
      'phone',
      'birthday',
      'gender',
      'ethnicity',
      'guardian',
      'national_id',
      'address',
      'note',
      'archival_note',
    ].forEach(visible.remove);
  }
  if (!(permissions?.hasPublicInfo ?? false)) {
    const [
      'avatar_url',
      'full_name',
      'display_name',
      'group_count',
      'linked_users',
      'created_at',
      'updated_at',
    ].forEach(visible.remove);
  }
  if (!(permissions?.canCheckUserAttendance ?? false)) {
    visible.remove('attendance_count');
  }
  return visible;
}

CrmUser crmVisibleUser(CrmUser user, CrmUserPermissions permissions) => CrmUser(
  id: user.id,
  workspaceId: user.workspaceId,
  fullName: permissions.hasPublicInfo ? user.fullName : null,
  displayName: permissions.hasPublicInfo ? user.displayName : null,
  avatarUrl: permissions.hasPublicInfo ? user.avatarUrl : null,
  email: permissions.hasPrivateInfo ? user.email : null,
  phone: permissions.hasPrivateInfo ? user.phone : null,
  gender: permissions.hasPrivateInfo ? user.gender : null,
  birthday: permissions.hasPrivateInfo ? user.birthday : null,
  ethnicity: permissions.hasPrivateInfo ? user.ethnicity : null,
  guardian: permissions.hasPrivateInfo ? user.guardian : null,
  nationalId: permissions.hasPrivateInfo ? user.nationalId : null,
  address: permissions.hasPrivateInfo ? user.address : null,
  note: permissions.hasPrivateInfo ? user.note : null,
  archived: user.archived,
  archivedUntil: user.archivedUntil,
  isGuest: user.isGuest,
  requireAttention: user.requireAttention,
  groupCount: permissions.hasPublicInfo ? user.groupCount : 0,
  attendanceCount: permissions.canCheckUserAttendance
      ? user.attendanceCount
      : 0,
  linkedPromotionsCount: user.linkedPromotionsCount,
  linkedPromotionNames: user.linkedPromotionNames,
);
