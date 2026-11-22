part of 'fleet_models.dart';

enum FleetMobileIssueKind { newIssue, regression, spike, test }

class FleetMobileIssue {
  const FleetMobileIssue({
    required this.id,
    required this.issueId,
    required this.platform,
    required this.kind,
    required this.build,
    required this.count,
    required this.urgent,
  });

  static FleetMobileIssue? parse(Map<String, dynamic> json) {
    final id = json['id'];
    final issueId = json['issueId'];
    final platform = json['platform'];
    final kind = switch (json['kind']) {
      'new' => FleetMobileIssueKind.newIssue,
      'regression' => FleetMobileIssueKind.regression,
      'spike' => FleetMobileIssueKind.spike,
      'test' => FleetMobileIssueKind.test,
      _ => null,
    };
    final build = json['build'];
    final count = json['count'];
    final priority = json['priority'];
    if (id is! String ||
        !RegExp(r'^mobile-[a-f0-9]{32}$').hasMatch(id) ||
        issueId is! String ||
        !RegExp(r'^[a-f0-9]{32}$').hasMatch(issueId) ||
        (platform != 'ios' && platform != 'android') ||
        kind == null ||
        build is! int ||
        build <= 0 ||
        count is! int ||
        count <= 0 ||
        (priority != 'fyi' && priority != 'decision')) {
      return null;
    }
    return FleetMobileIssue(
      id: id,
      issueId: issueId,
      platform: platform == 'ios' ? 'iOS' : 'Android',
      kind: kind,
      build: build,
      count: count,
      urgent: priority == 'decision',
    );
  }

  final String id;
  final String issueId;
  final String platform;
  final FleetMobileIssueKind kind;
  final int build;
  final int count;
  final bool urgent;
}
