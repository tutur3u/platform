import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';

class ShellActionSpec extends Equatable {
  const ShellActionSpec({
    required this.id,
    required this.icon,
    this.tooltip,
    this.onPressed,
    this.callbackToken,
    this.enabled = true,
    this.isLoading = false,
    this.highlighted = false,
    this.inDock = false,
    this.segmentGroup,
    this.searchController,
    this.searchHint,
    this.onSearchChanged,
    this.onCloseSearch,
  });

  final String id;
  final IconData icon;
  final String? tooltip;
  final VoidCallback? onPressed;
  final Object? callbackToken;
  final bool enabled;
  final bool isLoading;
  final bool highlighted;
  final bool inDock;
  final String? segmentGroup;
  final TextEditingController? searchController;
  final String? searchHint;
  final ValueChanged<String>? onSearchChanged;
  final VoidCallback? onCloseSearch;

  @override
  List<Object?> get props => [
    id,
    icon.codePoint,
    icon.fontFamily,
    icon.fontPackage,
    icon.matchTextDirection,
    tooltip,
    onPressed,
    callbackToken,
    enabled,
    isLoading,
    highlighted,
    inDock,
    segmentGroup,
    searchController,
    searchHint,
    onSearchChanged,
    onCloseSearch,
  ];
}

class ShellChromeActionsState extends Equatable {
  const ShellChromeActionsState({
    this.registrations = const <String, ShellChromeActionRegistration>{},
  });

  final Map<String, ShellChromeActionRegistration> registrations;

  List<ShellActionSpec> resolveForLocation(String matchedLocation) {
    final resolved = <ShellActionSpec>[];
    final seenActionIds = <String>{};
    for (final registration in registrations.values) {
      if (registration.locations.contains(matchedLocation)) {
        for (final action in registration.actions) {
          if (seenActionIds.add(action.id)) {
            resolved.add(action);
          }
        }
      }
    }
    return resolved;
  }

  bool immersiveForLocation(String location) => registrations.values.any(
    (registration) =>
        registration.immersive && registration.locations.contains(location),
  );

  ShellChromeActionsState copyWith({
    Map<String, ShellChromeActionRegistration>? registrations,
  }) {
    return ShellChromeActionsState(
      registrations: registrations ?? this.registrations,
    );
  }

  @override
  List<Object?> get props => [registrations.values.toList(growable: false)];
}

class ShellChromeActionRegistration extends Equatable {
  const ShellChromeActionRegistration({
    required this.ownerId,
    required this.locations,
    required this.actions,
    this.immersive = false,
  });

  final bool immersive;
  final String ownerId;
  final Set<String> locations;
  final List<ShellActionSpec> actions;

  @override
  List<Object?> get props => [
    ownerId,
    locations.toList(growable: false)..sort(),
    actions,
    immersive,
  ];
}

class ShellChromeActionsCubit extends Cubit<ShellChromeActionsState> {
  ShellChromeActionsCubit() : super(const ShellChromeActionsState());

  // Presentation only: callbacks and permission state are never cached.
  final Map<String, List<ShellActionSpec>> _dockPreviews = {};

  List<ShellActionSpec> dockPreviewForLocation(String location) =>
      _dockPreviews[location] ?? const [];

  void register({
    required String registrationId,
    required String ownerId,
    required Set<String> locations,
    required List<ShellActionSpec> actions,
    bool immersive = false,
  }) {
    if (isClosed) return;
    final nextRegistration = ShellChromeActionRegistration(
      ownerId: ownerId,
      immersive: immersive,
      locations: Set<String>.from(locations),
      actions: List<ShellActionSpec>.from(actions),
    );
    final currentRegistration = state.registrations[registrationId];
    if (currentRegistration == nextRegistration) {
      return;
    }

    for (final location in locations) {
      _dockPreviews[location] = [
        for (final action in actions.where((item) => item.inDock))
          ShellActionSpec(
            id: action.id,
            icon: action.icon,
            tooltip: action.tooltip,
            inDock: true,
            enabled: false,
          ),
      ];
    }
    emit(
      state.copyWith(
        registrations: <String, ShellChromeActionRegistration>{
          ...state.registrations,
          registrationId: nextRegistration,
        },
      ),
    );
  }

  void unregister(String registrationId) {
    if (isClosed || !state.registrations.containsKey(registrationId)) {
      return;
    }

    final nextRegistrations = Map<String, ShellChromeActionRegistration>.from(
      state.registrations,
    )..remove(registrationId);
    emit(state.copyWith(registrations: nextRegistrations));
  }

  /// Remove a departing route's dock action before its pop animation ends.
  /// Otherwise the handoff preview briefly shows a disabled stale action.
  void dismissOwner(String ownerId) {
    if (isClosed) return;
    final departed = state.registrations.values
        .where((registration) => registration.ownerId == ownerId)
        .toList();
    if (departed.isEmpty) return;
    for (final registration in departed) {
      registration.locations.forEach(_dockPreviews.remove);
    }
    final next = Map<String, ShellChromeActionRegistration>.from(
      state.registrations,
    )..removeWhere((_, registration) => registration.ownerId == ownerId);
    emit(state.copyWith(registrations: next));
  }
}
