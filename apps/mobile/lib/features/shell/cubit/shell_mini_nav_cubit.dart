import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';

class ShellMiniNavItemSpec extends Equatable {
  const ShellMiniNavItemSpec({
    required this.id,
    required this.icon,
    required this.label,
    this.onPressed,
    this.callbackToken,
    this.selected = false,
    this.enabled = true,
  });

  final String id;
  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final Object? callbackToken;
  final bool selected;
  final bool enabled;

  @override
  List<Object?> get props => [
    id,
    icon.codePoint,
    icon.fontFamily,
    icon.fontPackage,
    icon.matchTextDirection,
    label,
    callbackToken,
    selected,
    enabled,
  ];
}

class ShellMiniNavRegistration extends Equatable {
  const ShellMiniNavRegistration({
    required this.ownerId,
    required this.locations,
    required this.items,
    this.deepLinkBackRoute,
  });

  final String ownerId;
  final Set<String> locations;
  final List<ShellMiniNavItemSpec> items;
  final String? deepLinkBackRoute;

  @override
  List<Object?> get props => [
    ownerId,
    locations.toList(growable: false)..sort(),
    items,
    deepLinkBackRoute,
  ];
}

class ShellMiniNavState extends Equatable {
  const ShellMiniNavState({
    this.registrations = const <String, ShellMiniNavRegistration>{},
  });

  final Map<String, ShellMiniNavRegistration> registrations;

  ShellMiniNavRegistration? resolveForLocation(String matchedLocation) {
    ShellMiniNavRegistration? resolved;
    for (final registration in registrations.values) {
      if (registration.locations.contains(matchedLocation)) {
        resolved = registration;
      }
    }
    return resolved;
  }

  String? deepLinkBackRouteForLocation(String matchedLocation) {
    return resolveForLocation(matchedLocation)?.deepLinkBackRoute;
  }

  ShellMiniNavState copyWith({
    Map<String, ShellMiniNavRegistration>? registrations,
  }) {
    return ShellMiniNavState(
      registrations: registrations ?? this.registrations,
    );
  }

  @override
  List<Object?> get props => [registrations.values.toList(growable: false)];
}

class ShellMiniNavCubit extends Cubit<ShellMiniNavState> {
  ShellMiniNavCubit() : super(const ShellMiniNavState());

  void register({
    required String registrationId,
    required String ownerId,
    required Set<String> locations,
    required List<ShellMiniNavItemSpec> items,
    String? deepLinkBackRoute,
  }) {
    final nextRegistration = ShellMiniNavRegistration(
      ownerId: ownerId,
      locations: Set<String>.from(locations),
      items: List<ShellMiniNavItemSpec>.from(items),
      deepLinkBackRoute: deepLinkBackRoute,
    );
    final currentRegistration = state.registrations[registrationId];
    if (currentRegistration == nextRegistration) {
      return;
    }

    emit(
      state.copyWith(
        registrations: <String, ShellMiniNavRegistration>{
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

    final nextRegistrations = Map<String, ShellMiniNavRegistration>.from(
      state.registrations,
    )..remove(registrationId);
    emit(state.copyWith(registrations: nextRegistrations));
  }
}
