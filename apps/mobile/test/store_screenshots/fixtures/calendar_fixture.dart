import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mocktail/mocktail.dart';

import '../store_screenshot_app.dart';
import 'store_team.dart';

/// One timed event in the launch-week plan, relative to today.
class _Slot {
  const _Slot(
    this.day,
    this.hour,
    this.minute,
    this.minutes,
    this.color,
    this.en,
    this.vi,
  );

  final int day;
  final int hour;
  final int minute;
  final int minutes;
  final String color;
  final String en;
  final String vi;
}

const _standupDays = [-4, -3, -2, -1, 0, 1, 2, 3];

const _slots = <_Slot>[
  // Six days back: the week before launch week.
  _Slot(-6, 10, 0, 90, 'PINK', 'Moodboard session', 'Buổi lên moodboard'),
  _Slot(-6, 14, 30, 60, 'GREEN', 'Studio clean-up', 'Dọn dẹp studio'),
  _Slot(-5, 10, 0, 90, 'INDIGO', 'Portfolio review', 'Duyệt portfolio'),
  _Slot(-5, 15, 0, 60, 'GREEN', 'Gym with Bao', 'Tập gym cùng Bảo'),
  _Slot(
    -4,
    10,
    0,
    60,
    'PURPLE',
    'Launch week kickoff',
    'Khởi động tuần ra mắt',
  ),
  _Slot(-4, 14, 0, 90, 'TEAL', 'Copy deck review', 'Duyệt bộ nội dung'),
  _Slot(
    -3,
    10,
    0,
    60,
    'ORANGE',
    'Brand voice workshop',
    'Workshop giọng thương hiệu',
  ),
  _Slot(-3, 13, 0, 90, 'TEAL', 'Accessibility audit', 'Kiểm tra trợ năng'),
  _Slot(
    -2,
    11,
    0,
    90,
    'ORANGE',
    'Launch video storyboard',
    'Kịch bản video ra mắt',
  ),
  _Slot(-2, 14, 0, 60, 'INDIGO', 'Design crit', 'Góp ý thiết kế'),
  _Slot(-2, 16, 0, 30, 'AMBER', '1:1 with Minh', '1:1 với Minh'),
  _Slot(-1, 10, 0, 90, 'PINK', 'Final icon & palette', 'Chốt icon và bảng màu'),
  _Slot(-1, 13, 30, 90, 'RED', 'Team bug bash', 'Săn lỗi cả nhóm'),
  _Slot(-1, 16, 0, 60, 'PURPLE', 'Weekly retro', 'Họp nhìn lại tuần'),
  // Today.
  _Slot(
    0,
    10,
    0,
    90,
    'PURPLE',
    'Launch checklist review',
    'Rà soát checklist ra mắt',
  ),
  _Slot(0, 12, 0, 60, 'ORANGE', 'Lunch with Chi', 'Ăn trưa cùng Chi'),
  _Slot(0, 13, 30, 120, 'PINK', 'Launch video shoot', 'Quay video ra mắt'),
  _Slot(0, 16, 0, 45, 'TEAL', 'Press kit sync', 'Họp bộ tài liệu báo chí'),
  _Slot(
    1,
    10,
    30,
    60,
    'GREEN',
    'Onboarding copy pass',
    'Duyệt nội dung onboarding',
  ),
  _Slot(
    1,
    13,
    0,
    120,
    'INDIGO',
    'Usability test, round 2',
    'Kiểm thử khả dụng vòng 2',
  ),
  _Slot(1, 15, 30, 30, 'AMBER', '1:1 with An', '1:1 với An'),
  _Slot(2, 10, 0, 120, 'RED', 'Release candidate QA', 'Kiểm thử bản RC'),
  _Slot(
    2,
    13,
    30,
    60,
    'TEAL',
    'Marketing site handoff',
    'Bàn giao trang marketing',
  ),
  _Slot(2, 16, 0, 45, 'GREEN', 'Yoga break', 'Giải lao yoga'),
  _Slot(
    3,
    10,
    0,
    120,
    'PURPLE',
    'Launch day rehearsal',
    'Tổng duyệt ngày ra mắt',
  ),
  _Slot(3, 14, 0, 60, 'GREEN', 'Support FAQ write-up', 'Soạn FAQ hỗ trợ'),
  _Slot(4, 9, 0, 60, 'RED', 'Spring launch goes live', 'Ra mắt chính thức'),
  _Slot(4, 11, 0, 60, 'PINK', 'Social posts go out', 'Đăng bài mạng xã hội'),
  _Slot(4, 17, 0, 120, 'ORANGE', 'Team dinner', 'Tiệc tối cả nhóm'),
  _Slot(
    5,
    10,
    0,
    60,
    'BLUE',
    'Launch metrics review',
    'Xem số liệu sau ra mắt',
  ),
  _Slot(5, 14, 0, 180, 'GREEN', 'Hike with An', 'Leo núi cùng An'),
  _Slot(
    6,
    10,
    0,
    90,
    'PURPLE',
    'Plan the next sprint',
    'Lên kế hoạch sprint mới',
  ),
];

/// The team's launch-week calendar, today in the middle.
List<CalendarEvent> storeCalendarEvents(StoreLocale locale) {
  final events = <CalendarEvent>[
    for (final day in _standupDays)
      CalendarEvent(
        id: 'store-cal-standup-$day',
        title: locale.pick('Design standup', 'Họp sáng'),
        startAt: StoreTeam.at(9, 0, day).toUtc(),
        endAt: StoreTeam.at(9, 30, day).toUtc(),
        color: 'BLUE',
        wsId: StoreTeam.workspaceId,
      ),
    for (final (index, slot) in _slots.indexed)
      CalendarEvent(
        id: 'store-cal-$index',
        title: locale.pick(slot.en, slot.vi),
        startAt: StoreTeam.at(slot.hour, slot.minute, slot.day).toUtc(),
        endAt: StoreTeam.at(
          slot.hour,
          slot.minute + slot.minutes,
          slot.day,
        ).toUtc(),
        color: slot.color,
        wsId: StoreTeam.workspaceId,
      ),
    CalendarEvent(
      id: 'store-cal-launch-day',
      title: locale.pick('Launch day', 'Ngày ra mắt'),
      startAt: StoreTeam.at(0, 0, 4).toUtc(),
      endAt: StoreTeam.at(0, 0, 5).toUtc(),
      color: 'YELLOW',
      wsId: StoreTeam.workspaceId,
    ),
  ];
  return events;
}

/// Serves [storeCalendarEvents] for whatever range the cubit asks for.
class StoreCalendarRepository extends Mock implements CalendarRepository {
  StoreCalendarRepository(this.locale);

  final StoreLocale locale;

  @override
  Future<List<CalendarEvent>> getEvents(
    String wsId, {
    DateTime? start,
    DateTime? end,
  }) async {
    return storeCalendarEvents(locale)
        .where(
          (event) =>
              (start == null || event.endAt!.isAfter(start)) &&
              (end == null || event.startAt!.isBefore(end)),
        )
        .toList(growable: false);
  }

  @override
  Future<CalendarEvent?> getEventById(String wsId, String eventId) async =>
      null;

  @override
  void dispose() {}
}

/// A cache that never has anything and accepts every write.
class StoreEmptyCacheStore extends Mock implements CacheStore {
  @override
  Future<CacheReadResult<T>> read<T>({
    required CacheKey key,
    required CacheJsonDecoder<T> decode,
  }) async => CacheReadResult<T>(state: CacheEntryState.missing);

  @override
  Future<void> write({
    required CacheKey key,
    required CachePolicy policy,
    required Object? payload,
    String? etag,
    List<String> tags = const [],
    int? expectedRevision,
    void Function()? checkScope,
    bool requirePublication = false,
  }) async {
    checkScope?.call();
  }
}
