import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/calendar/utils/all_day_pill_corners.dart';

void main() {
  test('single-day pills round both ends', () {
    final ends = allDayPillRoundedEnds(
      continuesBeforeViewport: false,
      continuesAfterViewport: false,
      singleVisibleDay: true,
    );
    final radius = allDayPillBorderRadius(
      roundStart: ends.roundStart,
      roundEnd: ends.roundEnd,
      radius: 8,
    );
    expect(ends.roundStart, isTrue);
    expect(ends.roundEnd, isTrue);
    expect(radius.topLeft, const Radius.circular(8));
    expect(radius.topRight, const Radius.circular(8));
  });

  test('continuing spans square the clipped sides', () {
    final ends = allDayPillRoundedEnds(
      continuesBeforeViewport: true,
      continuesAfterViewport: false,
      singleVisibleDay: false,
    );
    final radius = allDayPillBorderRadius(
      roundStart: ends.roundStart,
      roundEnd: ends.roundEnd,
      radius: 8,
    );
    expect(ends.roundStart, isFalse);
    expect(ends.roundEnd, isTrue);
    expect(radius.topLeft, Radius.zero);
    expect(radius.topRight, const Radius.circular(8));
  });
}