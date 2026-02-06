import 'dart:convert';

import 'package:equatable/equatable.dart';

class PomodoroSettings extends Equatable {
  const PomodoroSettings({
    this.focusMinutes = 25,
    this.shortBreakMinutes = 5,
    this.longBreakMinutes = 15,
    this.sessionsUntilLongBreak = 4,
    this.autoStartBreaks = false,
    this.autoStartFocus = false,
  });

  factory PomodoroSettings.fromJson(Map<String, dynamic> json) =>
      PomodoroSettings(
        focusMinutes: (json['focus_minutes'] as num?)?.toInt() ?? 25,
        shortBreakMinutes: (json['short_break_minutes'] as num?)?.toInt() ?? 5,
        longBreakMinutes: (json['long_break_minutes'] as num?)?.toInt() ?? 15,
        sessionsUntilLongBreak:
            (json['sessions_until_long_break'] as num?)?.toInt() ?? 4,
        autoStartBreaks: json['auto_start_breaks'] as bool? ?? false,
        autoStartFocus: json['auto_start_focus'] as bool? ?? false,
      );

  factory PomodoroSettings.fromJsonString(String jsonString) =>
      PomodoroSettings.fromJson(
        json.decode(jsonString) as Map<String, dynamic>,
      );

  final int focusMinutes;
  final int shortBreakMinutes;
  final int longBreakMinutes;
  final int sessionsUntilLongBreak;
  final bool autoStartBreaks;
  final bool autoStartFocus;

  Map<String, dynamic> toJson() => {
    'focus_minutes': focusMinutes,
    'short_break_minutes': shortBreakMinutes,
    'long_break_minutes': longBreakMinutes,
    'sessions_until_long_break': sessionsUntilLongBreak,
    'auto_start_breaks': autoStartBreaks,
    'auto_start_focus': autoStartFocus,
  };

  String toJsonString() => json.encode(toJson());

  PomodoroSettings copyWith({
    int? focusMinutes,
    int? shortBreakMinutes,
    int? longBreakMinutes,
    int? sessionsUntilLongBreak,
    bool? autoStartBreaks,
    bool? autoStartFocus,
  }) => PomodoroSettings(
    focusMinutes: focusMinutes ?? this.focusMinutes,
    shortBreakMinutes: shortBreakMinutes ?? this.shortBreakMinutes,
    longBreakMinutes: longBreakMinutes ?? this.longBreakMinutes,
    sessionsUntilLongBreak:
        sessionsUntilLongBreak ?? this.sessionsUntilLongBreak,
    autoStartBreaks: autoStartBreaks ?? this.autoStartBreaks,
    autoStartFocus: autoStartFocus ?? this.autoStartFocus,
  );

  @override
  List<Object?> get props => [
    focusMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    sessionsUntilLongBreak,
    autoStartBreaks,
    autoStartFocus,
  ];
}
