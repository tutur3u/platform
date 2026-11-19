import 'package:mobile/data/models/crm/crm_models.dart';

/// One row in a Contacts section list.
class ContactSectionRecord {
  const ContactSectionRecord({
    required this.id,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String id;
  final String title;
  final String? subtitle;
  final String? trailing;
}

List<ContactSectionRecord> contactReportRecords(Map<String, dynamic> json) {
  return _records(json['data'], (row) {
    final title = crmAsString(row['title']);
    return ContactSectionRecord(
      id: crmAsString(row['id']) ?? '',
      title: title ?? crmAsString(row['user_email']) ?? '',
      subtitle: title == null ? null : crmAsString(row['user_email']),
      trailing: crmAsString(row['report_stage']),
    );
  });
}

List<ContactSectionRecord> contactApprovalRecords(Map<String, dynamic> json) {
  final rows = json['items'] ?? json['data'];
  return _records(rows, (row) {
    final title = crmAsString(row['title']) ?? crmAsString(row['content']);
    final person =
        crmAsString(row['user_display_name']) ??
        crmAsString(row['user_full_name']) ??
        crmAsString(row['user_email']);
    return ContactSectionRecord(
      id: crmAsString(row['id']) ?? '',
      title: title ?? person ?? '',
      subtitle: person,
      trailing:
          crmAsString(row['report_approval_status']) ??
          crmAsString(row['approval_status']),
    );
  });
}

List<ContactSectionRecord> contactAnnouncementRecords(
  Map<String, dynamic> json,
) {
  return _records(json['data'], (row) {
    return ContactSectionRecord(
      id: crmAsString(row['id']) ?? '',
      title: crmAsString(row['title']) ?? '',
      subtitle: crmAsString(row['topic']) ?? crmAsString(row['class_label']),
      trailing: crmAsString(row['status']),
    );
  });
}

List<ContactSectionRecord> contactMetricRecords(Map<String, dynamic> json) {
  return _records(json['groupIndicators'], (row) {
    final unit = crmAsString(row['unit']);
    return ContactSectionRecord(
      id: crmAsString(row['id']) ?? '',
      title: crmAsString(row['name']) ?? '',
      subtitle: unit,
    );
  });
}

List<ContactSectionRecord> contactGuestLeadRecords(Map<String, dynamic> json) {
  return _records(json['data'], (row) {
    final guest = row['is_guest'];
    if (guest != true && guest != 'true') {
      return const ContactSectionRecord(id: '', title: '');
    }
    return ContactSectionRecord(
      id: crmAsString(row['id']) ?? '',
      title: crmAsString(row['full_name']) ?? crmAsString(row['email']) ?? '',
      subtitle: crmAsString(row['group_name']) ?? crmAsString(row['email']),
      trailing: crmAsString(row['phone']),
    );
  });
}

List<ContactSectionRecord> _records(
  Object? value,
  ContactSectionRecord Function(Map<String, dynamic> row) map,
) {
  if (value is! List) return const [];
  return value
      .whereType<Map<dynamic, dynamic>>()
      .map((row) => map(Map<String, dynamic>.from(row)))
      .where((record) => record.id.isNotEmpty && record.title.isNotEmpty)
      .toList(growable: false);
}
