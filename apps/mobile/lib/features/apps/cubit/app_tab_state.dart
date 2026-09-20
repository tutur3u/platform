import 'package:equatable/equatable.dart';

class AppTabState extends Equatable {
  const AppTabState({
    this.selectedId,
    this.shouldAutoFocus = false,
    this.showAppsTab = false,
  });

  final String? selectedId;
  final bool shouldAutoFocus;
  final bool showAppsTab;

  bool get hasSelection => selectedId != null;

  AppTabState copyWith({
    String? Function()? selectedId,
    bool? shouldAutoFocus,
    bool? showAppsTab,
  }) {
    return AppTabState(
      selectedId: selectedId != null ? selectedId() : this.selectedId,
      shouldAutoFocus: shouldAutoFocus ?? this.shouldAutoFocus,
      showAppsTab: showAppsTab ?? this.showAppsTab,
    );
  }

  @override
  List<Object?> get props => [selectedId, shouldAutoFocus, showAppsTab];
}
