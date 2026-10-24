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
    this.onSearchSubmitted,
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
  final ValueChanged<String>? onSearchSubmitted;
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
    onSearchSubmitted,
    onCloseSearch,
  ];
}

class ShellChromeActionsState extends Equatable {
  const ShellChromeActionsState({
    this.registrations = const <String, ShellChromeActionRegistration>{},
  });

  final Map<String, ShellChromeActionRegistration> registrations;

  /// Owner of the topmost open sheet or dialog, if any.
  ///
  /// Modal registrations apply to every location: an overlay covers whatever
  /// page is visible, so its actions and Back replace the page's until closed.
  String? get topmostModalOwner {
    String? owner;
    for (final registration in registrations.values) {
      if (registration.modal) owner = registration.ownerId;
    }
    return owner;
  }

  List<ShellActionSpec> resolveForLocation(String matchedLocation) {
    final resolved = <ShellActionSpec>[];
    final seenActionIds = <String>{};
    final modalOwner = topmostModalOwner;
    for (final registration in registrations.values) {
      if (modalOwner != null
          ? registration.modal && registration.ownerId == modalOwner
          : registration.locations.contains(matchedLocation)) {
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

  Future<void> Function()? backForLocation(String location) {
    final modalOwner = topmostModalOwner;
    if (modalOwner != null) {
      for (final registration in registrations.values.toList().reversed) {
        if (registration.ownerId == modalOwner && registration.onBack != null) {
          return registration.onBack;
        }
      }
    }
    for (final registration in registrations.values.toList().reversed) {
      if (registration.locations.contains(location) &&
          registration.onBack != null) {
        return registration.onBack;
      }
    }
    return null;
  }

  VoidCallback? resetSectionForLocation(String location) {
    for (final registration in registrations.values.toList().reversed) {
      if (registration.locations.contains(location) &&
          registration.onResetSection != null) {
        return registration.onResetSection;
      }
    }
    // Existing section switches put the default section first in their group.
    final seenGroups = <String>{};
    for (final action in resolveForLocation(location)) {
      final group = action.segmentGroup;
      if (group != null &&
          seenGroups.add(group) &&
          !action.highlighted &&
          action.enabled &&
          action.onPressed != null) {
        return action.onPressed;
      }
    }
    return null;
  }

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
    this.modal = false,
    this.onBack,
    this.onResetSection,
  });

  final bool immersive;

  /// Registered by an open sheet or dialog; see
  /// [ShellChromeActionsState.topmostModalOwner].
  final bool modal;
  final String ownerId;
  final Set<String> locations;
  final List<ShellActionSpec> actions;
  final Future<void> Function()? onBack;
  final VoidCallback? onResetSection;

  @override
  List<Object?> get props => [
    ownerId,
    locations.toList(growable: false)..sort(),
    actions,
    immersive,
    modal,
    onBack,
    onResetSection,
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
    bool modal = false,
    Future<void> Function()? onBack,
    VoidCallback? onResetSection,
  }) {
    if (isClosed || _retiredOwners.contains(ownerId)) return;
    final nextRegistration = ShellChromeActionRegistration(
      ownerId: ownerId,
      immersive: immersive,
      modal: modal,
      locations: Set<String>.from(locations),
      actions: List<ShellActionSpec>.from(actions),
      onBack: onBack,
      onResetSection: onResetSection,
    );
    final currentRegistration = state.registrations[registrationId];
    if (currentRegistration == nextRegistration) {
      return;
    }

    for (final location in modal ? const <String>{} : locations) {
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
  // Owners whose overlay is closing; late re-registrations are ignored.
  final Set<String> _retiredOwners = {};

  /// Removes [ownerId]'s registrations and ignores further ones until
  /// [forgetOwner]. Overlays call this when their pop begins, so Back during
  /// the reverse transition reaches the overlay beneath.
  void retireOwner(String ownerId) {
    _retiredOwners.add(ownerId);
    dismissOwner(ownerId);
  }

  /// Drops [ownerId] from the retired set once its overlay is disposed.
  void forgetOwner(String ownerId) => _retiredOwners.remove(ownerId);

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
