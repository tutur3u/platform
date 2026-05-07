import 'package:flutter/material.dart';

int firstDayOfWeekForContext(BuildContext context) {
  const weekdayByIndex = [
    DateTime.sunday,
    DateTime.monday,
    DateTime.tuesday,
    DateTime.wednesday,
    DateTime.thursday,
    DateTime.friday,
    DateTime.saturday,
  ];
  final firstDayOfWeekIndex = MaterialLocalizations.of(
    context,
  ).firstDayOfWeekIndex;
  return weekdayByIndex[firstDayOfWeekIndex % 7];
}
