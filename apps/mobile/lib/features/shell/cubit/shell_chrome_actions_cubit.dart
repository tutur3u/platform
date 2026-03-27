import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';

class ShellActionSpec extends Equatable {
  const ShellActionSpec({
    required this.id,
    required this.icon,
    this.tooltip,
    this.onPressed,
    this.enabled = true,
    this.isLoading = false,
    this.highlighted = false,
  });

  final String id;
  final IconData icon;
  final String? tooltip;
  final VoidCallback? onPressed;
  final bool enabled;
  final bool isLoading;
  final bool highlighted;

  @override
  List<Object?> get props => [
    id,
    icon.codePoint,
    icon.fontFamily,
    icon.fontPackage,
    icon.matchTextDirection,
    tooltip,
    enabled,
    isLoading,
    highlighted,
  ];
}

class ShellChromeActionsState extends Equatable {
  const ShellChromeActionsState({
    this.registrations = const <String, ShellChromeActionRegistration>{},
  });

  final Map<String, ShellChromeActionRegistration> registrations;

  List<ShellActionSpec> resolveForLocation(String matchedLocation) {
    final resolved = <ShellActionSpec>[];
    for (final registration in registrations.values) {
      if (registration.locations.contains(matchedLocation)) {
        resolved.addAll(registration.actions);
      }
    }
    return resolved;
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
  });

  final String ownerId;
  final Set<String> locations;
  final List<ShellActionSpec> actions;

  @override
  List<Object?> get props => [
    ownerId,
    locations.toList(growable: false)..sort(),
    actions,
  ];
}

class ShellChromeActionsCubit extends Cubit<ShellChromeActionsState> {
  ShellChromeActionsCubit() : super(const ShellChromeActionsState());

  void register({
    required String ownerId,
    required Set<String> locations,
    required List<ShellActionSpec> actions,
  }) {
    final nextRegistration = ShellChromeActionRegistration(
      ownerId: ownerId,
      locations: Set<String>.from(locations),
      actions: List<ShellActionSpec>.from(actions),
    );
    final currentRegistration = state.registrations[ownerId];
    if (currentRegistration == nextRegistration) {
      return;
    }

    emit(
      state.copyWith(
        registrations: <String, ShellChromeActionRegistration>{
          ...state.registrations,
          ownerId: nextRegistration,
        },
      ),
    );
  }

  void unregister(String ownerId) {
    if (!state.registrations.containsKey(ownerId)) {
      return;
    }

    final nextRegistrations = Map<String, ShellChromeActionRegistration>.from(
      state.registrations,
    )..remove(ownerId);
    emit(state.copyWith(registrations: nextRegistrations));
  }
}
