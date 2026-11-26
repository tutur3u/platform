typedef ProgressMetric = ({String id, String name, String unit, bool total});
typedef ProgressEntry = ({
  String date,
  num value,
  String metricId,
  String? note,
});
typedef ProgressGoal = ({String name, num value, num target, String? unit});
typedef ProgressRank = ({String? name, int? rank, num value});
typedef ProgressLeaderboard = ({String name, List<ProgressRank> rankings});

class TaskProgressSnapshot {
  const TaskProgressSnapshot({
    required this.metrics,
    required this.entries,
    required this.goals,
    required this.leaderboards,
  });

  final List<ProgressMetric> metrics;
  final List<ProgressEntry> entries;
  final List<ProgressGoal> goals;
  final List<ProgressLeaderboard> leaderboards;
}
