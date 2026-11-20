import 'package:mobile/data/models/crm/crm_models.dart';

/// One row in a Contacts section list.
class ContactSectionRecord {
  const ContactSectionRecord({
    required this.id,
    required this.title,
    this.subtitle,
    this.trailing,
    this.report,
    this.approval,
  });

  final String id;
  final String title;
  final String? subtitle;
  final String? trailing;
  final ContactReportDetails? report;
  final ContactApprovalDetails? approval;
}

class ContactReportDetails {
  const ContactReportDetails({
    this.group,
    this.content,
    this.feedback,
    this.periodStart,
    this.periodEnd,
  });

  final String? group;
  final String? content;
  final String? feedback;
  final DateTime? periodStart;
  final DateTime? periodEnd;
}

enum ContactReportCadence { all, weekly, monthly, quarterly, yearly }

class ContactReportPage {
  const ContactReportPage({required this.records, required this.total});

  factory ContactReportPage.fromJson(Map<String, dynamic> json) {
    return ContactReportPage(
      records: contactReportRecords(json),
      total: crmAsInt(json['total']),
    );
  }

  static const pageSize = 30;

  final List<ContactSectionRecord> records;
  final int total;
}

List<ContactSectionRecord> contactReportRecords(Map<String, dynamic> json) {
  return _records(json['data'], (row) {
    final member =
        crmAsString(row['user_name']) ?? crmAsString(row['user_email']);
    final title = crmAsString(row['title']);
    return ContactSectionRecord(
      id: crmAsString(row['id']) ?? '',
      title: title ?? member ?? '',
      subtitle: title == null ? null : member,
      trailing: crmAsString(row['report_stage']),
      report: ContactReportDetails(
        group: crmAsString(row['group_name']),
        content: crmAsString(row['content']),
        feedback: crmAsString(row['feedback']),
        periodStart: DateTime.tryParse(crmAsString(row['period_start']) ?? ''),
        periodEnd: DateTime.tryParse(crmAsString(row['period_end']) ?? ''),
      ),
    );
  });
}

enum ContactApprovalKind { reports, posts }

enum ContactApprovalDecision { approve, reject }

class ContactApprovalDetails {
  const ContactApprovalDetails({
    required this.kind,
    this.group,
    this.content,
    this.comment,
  });

  final ContactApprovalKind kind;
  final String? group;
  final String? content;
  final String? comment;
}

List<ContactSectionRecord> contactApprovalRecords(
  Map<String, dynamic> json, {
  required ContactApprovalKind kind,
}) {
  final rows = json['items'] ?? json['data'];
  final isReport = kind == ContactApprovalKind.reports;
  return _records(rows, (row) {
    final person =
        crmAsString(row['user_name']) ??
        crmAsString(row['user_display_name']) ??
        crmAsString(row['user_full_name']) ??
        crmAsString(row['user_email']);
    final title = crmAsString(row['title']);
    final content = crmAsString(row['content']);
    return ContactSectionRecord(
      id: crmAsString(row['id']) ?? '',
      title: title ?? person ?? content ?? '',
      subtitle: title == null ? null : person,
      trailing:
          crmAsString(
            row[isReport ? 'report_approval_status' : 'post_approval_status'],
          ) ??
          crmAsString(row['approval_status']),
      approval: ContactApprovalDetails(
        kind: kind,
        group: crmAsString(row['group_name']),
        content: content,
        comment: crmAsString(row[isReport ? 'feedback' : 'notes']),
      ),
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
