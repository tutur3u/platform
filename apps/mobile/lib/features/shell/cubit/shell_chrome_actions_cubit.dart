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
  });

  final String id;
  final IconData icon;
  final String? tooltip;
  final VoidCallback? onPressed;
  final Object? callbackToken;
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
    callbackToken,
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
    required String registrationId,
    required String ownerId,
    required Set<String> locations,
    required List<ShellActionSpec> actions,
  }) {
    final nextRegistration = ShellChromeActionRegistration(
      ownerId: ownerId,
      locations: Set<String>.from(locations),
      actions: List<ShellActionSpec>.from(actions),
    );
    final currentRegistration = state.registrations[registrationId];
    if (currentRegistration == nextRegistration) {
      return;
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
    if (!state.registrations.containsKey(registrationId)) {
      return;
    }

    final nextRegistrations = Map<String, ShellChromeActionRegistration>.from(
      state.registrations,
    )..remove(registrationId);
    emit(state.copyWith(registrations: nextRegistrations));
  }
}
