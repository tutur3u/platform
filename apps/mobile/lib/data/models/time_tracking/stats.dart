import 'package:equatable/equatable.dart';

class DailyActivity extends Equatable {
  const DailyActivity({
    required this.date,
    this.duration = 0,
    this.sessions = 0,
  });

  factory DailyActivity.fromJson(Map<String, dynamic> json) => DailyActivity(
    date: DateTime.parse(json['date'] as String),
    duration: (json['duration'] as num?)?.toInt() ?? 0,
    sessions: (json['sessions'] as num?)?.toInt() ?? 0,
  );

  final DateTime date;
  final int duration; // seconds
  final int sessions;

  @override
  List<Object?> get props => [date, duration, sessions];
}

class TimeTrackerStats extends Equatable {
  const TimeTrackerStats({
    this.todayTime = 0,
    this.weekTime = 0,
    this.monthTime = 0,
    this.streak = 0,
    this.dailyActivity = const [],
  });

  factory TimeTrackerStats.fromJson(Map<String, dynamic> json) {
    final activity =
        (json['daily_activity'] as List<dynamic>?)
            ?.map((e) => DailyActivity.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];

    return TimeTrackerStats(
      todayTime: (json['today_time'] as num?)?.toInt() ?? 0,
      weekTime: (json['week_time'] as num?)?.toInt() ?? 0,
      monthTime: (json['month_time'] as num?)?.toInt() ?? 0,
      streak: (json['streak'] as num?)?.toInt() ?? 0,
      dailyActivity: activity,
    );
  }

  final int todayTime; // seconds
  final int weekTime;
  final int monthTime;
  final int streak; // days
  final List<DailyActivity> dailyActivity;

  @override
  List<Object?> get props => [
    todayTime,
    weekTime,
    monthTime,
    streak,
    dailyActivity,
  ];
}
