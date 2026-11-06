import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';

/// What the Work Staff segment renders: `observability.staff[]` as the hub
/// publishes it, which is `{role, title, state, model}` and nothing about when
/// a role last worked or how often. Rows sort by state priority and then by
/// role, never by activity.
final class MastermindStaffModel {
  const MastermindStaffModel._({required this.rows, required this.running});

  factory MastermindStaffModel.from(MastermindSnapshot snapshot) {
    final staff = snapshot.observability.staff;
    final indexed = [for (var i = 0; i < staff.length; i++) (i, staff[i])]
      ..sort((a, b) {
        final byState = laneStatePriority
            .indexOf(a.$2.state)
            .compareTo(laneStatePriority.indexOf(b.$2.state));
        if (byState != 0) return byState;
        final byRole = a.$2.role.toLowerCase().compareTo(
          b.$2.role.toLowerCase(),
        );
        return byRole != 0 ? byRole : a.$1.compareTo(b.$1);
      });
    final rows = [for (final entry in indexed) entry.$2];
    return MastermindStaffModel._(
      rows: rows,
      running: rows.where((row) => row.state == LaneState.running).length,
    );
  }

  final List<Staff> rows;

  /// Roles in the running state, for the summary line.
  final int running;

  bool get isEmpty => rows.isEmpty;
}

/// The model the publisher could not name arrives as the literal `unknown`.
bool isUnknownStaffModel(Staff staff) =>
    staff.model.trim().toLowerCase() == 'unknown';
