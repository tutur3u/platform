/// A presentation profile for one account in one workspace.
///
/// A mode only changes what the app puts first. It never grants access:
/// every surface keeps its own permission check, and workspace-hidden
/// modules stay hidden.
enum AudienceMode {
  general('general'),
  education('education');

  const AudienceMode(this.wireValue);

  /// The value stored in the config tables.
  final String wireValue;

  static AudienceMode? parse(Object? raw) {
    if (raw is! String) return null;
    final value = raw.trim().toLowerCase();
    for (final mode in values) {
      if (mode.wireValue == value) return mode;
    }
    return null;
  }

  AudienceModeProfile get profile => audienceModeProfiles[this]!;
}

/// What a mode puts first. Future modes add a row to [audienceModeProfiles].
class AudienceModeProfile {
  const AudienceModeProfile({this.homeWidgets = const []});

  /// Home widget ids this mode adds, ranked ahead of the shared widgets.
  final List<String> homeWidgets;
}

/// Home widget id of the Education "Today's classes" card.
const classesTodayHomeWidgetId = 'classes_today';

const audienceModeProfiles = <AudienceMode, AudienceModeProfile>{
  AudienceMode.general: AudienceModeProfile(),
  AudienceMode.education: AudienceModeProfile(
    homeWidgets: [classesTodayHomeWidgetId],
  ),
};

/// Where the resolved mode came from.
enum AudienceModeSource { override, workspaceDefault, account, fallback }

/// The order in which stored layers win. The first stored value applies.
///
/// The personal override wins over the admin default so a member can opt
/// out of a workspace-wide Education rollout. Reordering this list is the
/// switch for a different policy.
const List<AudienceModeSource> audienceModePrecedence = [
  AudienceModeSource.override,
  AudienceModeSource.workspaceDefault,
  AudienceModeSource.account,
];

typedef ResolvedAudienceMode = ({AudienceMode mode, AudienceModeSource source});

ResolvedAudienceMode resolveAudienceMode({
  AudienceMode? override,
  AudienceMode? workspaceDefault,
  AudienceMode? account,
}) {
  for (final source in audienceModePrecedence) {
    final mode = switch (source) {
      AudienceModeSource.override => override,
      AudienceModeSource.workspaceDefault => workspaceDefault,
      AudienceModeSource.account => account,
      AudienceModeSource.fallback => null,
    };
    if (mode != null) return (mode: mode, source: source);
  }
  return (mode: AudienceMode.general, source: AudienceModeSource.fallback);
}
