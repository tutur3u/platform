part of 'fleet_models.dart';

/// The provider an access request signs into. Labels are product names.
enum FleetLoginService {
  github('GitHub'),
  cloudflare('Cloudflare'),
  vercel('Vercel'),
  claude('Claude'),
  openai('OpenAI'),
  google('Google'),
  apple('Apple'),
  supabase('Supabase'),
  microsoft('Microsoft');

  const FleetLoginService(this.label);

  final String label;
}

/// - `device`: open the link on any device and enter the code.
/// - `link`: open the link on any device; no code.
/// - `localCallback`: the provider redirects to a loopback listener, so the
///   sign-in completes only in a browser on [FleetLogin.machineId].
enum FleetLoginFlow {
  device('device'),
  link('link'),
  localCallback('local_callback');

  const FleetLoginFlow(this.wire);

  final String wire;
}

enum FleetLoginState { waiting, approved, verified, expired, failed }

/// An access request. Web allowlists the link per service and drops the link
/// and code once the request ends; the client still checks the link shape
/// before opening it and treats a passed expiry as expired on its own clock.
class FleetLogin {
  const FleetLogin({
    required this.service,
    required this.flow,
    required this.state,
    this.url,
    this.userCode,
    this.expiresAt,
    this.machineId,
  });

  static FleetLogin? parse(Map<String, dynamic> json) {
    final service = _enum(FleetLoginService.values, json['service']);
    final flow = FleetLoginFlow.values
        .where((f) => f.wire == json['flow'])
        .firstOrNull;
    final state = _enum(FleetLoginState.values, json['state']);
    if (service == null || flow == null || state == null) return null;
    final raw = Uri.tryParse(_string(json['url']) ?? '');
    final url =
        raw != null &&
            raw.scheme == 'https' &&
            raw.host.isNotEmpty &&
            raw.userInfo.isEmpty
        ? raw
        : null;
    final userCode = flow == FleetLoginFlow.device
        ? _string(json['userCode'])
        : null;
    final expiresAt = _time(json['expiresAt']);
    final open =
        state == FleetLoginState.waiting || state == FleetLoginState.approved;
    // Web refuses an open request without a safe link, an expiry, or (for a
    // device flow) a code; a card offering actions without them would never
    // expire.
    if (open &&
        (url == null ||
            expiresAt == null ||
            (flow == FleetLoginFlow.device && userCode == null))) {
      return null;
    }
    return FleetLogin(
      service: service,
      flow: flow,
      state: state,
      url: open ? url : null,
      userCode: open ? userCode : null,
      expiresAt: expiresAt,
      machineId: _string(json['machineId']),
    );
  }

  final FleetLoginService service;
  final FleetLoginFlow flow;
  final FleetLoginState state;
  final Uri? url;
  final String? userCode;
  final DateTime? expiresAt;
  final String? machineId;

  /// A waiting or approved request past its expiry reads as expired.
  FleetLoginState stateAt(DateTime now) =>
      (state == FleetLoginState.waiting || state == FleetLoginState.approved) &&
          expiresAt != null &&
          !expiresAt!.isAfter(now)
      ? FleetLoginState.expired
      : state;

  bool isOpenAt(DateTime now) {
    final effective = stateAt(now);
    return effective == FleetLoginState.waiting ||
        effective == FleetLoginState.approved;
  }
}
