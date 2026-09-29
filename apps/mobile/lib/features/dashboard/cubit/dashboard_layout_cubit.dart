import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/repositories/settings_repository.dart';

const homeWidgetIds = [
  'tasks',
  'calendar',
  'mail',
  'meet',
  'finance',
  'notes',
  'summary',
];

class DashboardLayoutState extends Equatable {
  const DashboardLayoutState({this.order = const [], this.hidden = const []});

  final List<String> order;
  final List<String> hidden;

  List<String> arranged(List<String> available) {
    int rank(String id) {
      final customIndex = order.indexOf(id);
      if (customIndex >= 0) return customIndex;
      return order.length + homeWidgetIds.indexOf(id);
    }

    return [...available]..sort((a, b) {
      final aHidden = hidden.contains(a);
      final bHidden = hidden.contains(b);
      if (aHidden != bHidden) return aHidden ? 1 : -1;
      return rank(a).compareTo(rank(b));
    });
  }

  DashboardLayoutState copyWith({List<String>? order, List<String>? hidden}) =>
      DashboardLayoutState(
        order: order ?? this.order,
        hidden: hidden ?? this.hidden,
      );

  @override
  List<Object?> get props => [order, hidden];
}

class DashboardLayoutCubit extends Cubit<DashboardLayoutState> {
  DashboardLayoutCubit({required SettingsRepository settingsRepository})
    : _settings = settingsRepository,
      super(const DashboardLayoutState());

  final SettingsRepository _settings;
  int _version = 0;

  Future<void> load() async {
    final version = _version;
    try {
      final order = await _settings.getHomeWidgetOrder();
      final hidden = await _settings.getHiddenHomeWidgets();
      if (!isClosed && version == _version) {
        emit(DashboardLayoutState(order: order, hidden: hidden));
      }
    } on Object {
      // Keep the default Home layout when local preferences are unavailable.
    }
  }

  Future<void> setOrder(List<String> ids) async {
    _version++;
    final desired = ids.where(homeWidgetIds.contains).toSet().toList();
    final reordered = <String>[];
    var nextAvailable = 0;
    for (final saved in state.order) {
      if (desired.contains(saved)) {
        if (nextAvailable < desired.length) {
          reordered.add(desired[nextAvailable++]);
        }
      } else if (homeWidgetIds.contains(saved)) {
        reordered.add(saved);
      }
    }
    reordered.addAll(desired.skip(nextAvailable));
    emit(state.copyWith(order: List.unmodifiable(reordered)));
    await _settings.setHomeWidgetOrder(reordered);
  }

  Future<void> setHidden(String id, {required bool hidden}) async {
    if (!homeWidgetIds.contains(id)) return;
    _version++;
    final ids = [...state.hidden];
    if (hidden) {
      if (!ids.contains(id)) ids.add(id);
    } else {
      ids.remove(id);
    }
    emit(state.copyWith(hidden: List.unmodifiable(ids)));
    await _settings.setHiddenHomeWidgets(ids);
  }
}
