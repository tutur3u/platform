import 'package:equatable/equatable.dart';

class AppTabState extends Equatable {
  const AppTabState({
    this.selectedId,
    this.appOrigin = '/',
    this.shouldAutoFocus = false,
    this.showAppsTab = false,
    this.appOrder = const [],
    this.hiddenAppIds = const [],
    this.pinnedAppIds = const [],
    this.recentAppIds = const [],
  });

  final String? selectedId;
  final String appOrigin;
  final bool shouldAutoFocus;
  final bool showAppsTab;
  final List<String> appOrder;
  final List<String> hiddenAppIds;
  final List<String> pinnedAppIds;
  final List<String> recentAppIds;

  bool get hasSelection => selectedId != null;

  AppTabState copyWith({
    String? Function()? selectedId,
    String? appOrigin,
    bool? shouldAutoFocus,
    bool? showAppsTab,
    List<String>? appOrder,
    List<String>? hiddenAppIds,
    List<String>? pinnedAppIds,
    List<String>? recentAppIds,
  }) {
    return AppTabState(
      selectedId: selectedId != null ? selectedId() : this.selectedId,
      appOrigin: appOrigin ?? this.appOrigin,
      shouldAutoFocus: shouldAutoFocus ?? this.shouldAutoFocus,
      showAppsTab: showAppsTab ?? this.showAppsTab,
      appOrder: appOrder ?? this.appOrder,
      hiddenAppIds: hiddenAppIds ?? this.hiddenAppIds,
      pinnedAppIds: pinnedAppIds ?? this.pinnedAppIds,
      recentAppIds: recentAppIds ?? this.recentAppIds,
    );
  }

  @override
  List<Object?> get props => [
    selectedId,
    appOrigin,
    shouldAutoFocus,
    showAppsTab,
    appOrder,
    hiddenAppIds,
    pinnedAppIds,
    recentAppIds,
  ];
}
