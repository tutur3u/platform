import 'package:equatable/equatable.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';

enum FleetTopic { status, readiness, timeline }

enum FleetPriority { low, normal, high, urgent }

enum FleetWorkTemplate implements FleetWireValue {
  investigation('investigation'),
  maintenance('maintenance'),
  regressionFix('regression_fix');

  const FleetWorkTemplate(this.wire);
  @override
  final String wire;
}

enum FleetObjective implements FleetWireValue {
  investigate('investigate'),
  verify('verify'),
  prepareReview('prepare_review');

  const FleetObjective(this.wire);
  @override
  final String wire;
}

enum FleetEnvironment { staging, production }

/// The fields a request form shows and validates.
enum FleetDraftField {
  project,
  topic,
  target,
  priority,
  template,
  objective,
  environment,
  commitSha,
  quote,
}

enum FleetDraftError { required, invalid, tooLong }

/// The fields each kind sends besides the project, matching the server's
/// strict payload schemas.
extension FleetIntentKindFields on FleetIntentKind {
  Set<FleetDraftField> get fields => switch (this) {
    FleetIntentKind.statusQuestion => {FleetDraftField.topic},
    FleetIntentKind.comment ||
    FleetIntentKind.approveItem ||
    FleetIntentKind.lanePause => {FleetDraftField.target},
    FleetIntentKind.prioritySet => {
      FleetDraftField.target,
      FleetDraftField.priority,
    },
    FleetIntentKind.workCreate => {
      FleetDraftField.target,
      FleetDraftField.template,
    },
    FleetIntentKind.workRedirect => {
      FleetDraftField.target,
      FleetDraftField.objective,
    },
    FleetIntentKind.approveDeploy => {
      FleetDraftField.target,
      FleetDraftField.environment,
      FleetDraftField.commitSha,
    },
    // Production is the only environment a production change names.
    FleetIntentKind.approveProductionChange => {
      FleetDraftField.target,
      FleetDraftField.commitSha,
    },
  };

  bool get requiresQuote => this == FleetIntentKind.comment;
}

/// A typed request as the form holds it. Quotes are display text only: the
/// server keeps them apart from the action and never sends them to a lane.
final class FleetIntentDraft extends Equatable {
  const FleetIntentDraft({
    required this.kind,
    this.projectKey,
    this.topic,
    this.targetKey = '',
    this.priority,
    this.template,
    this.objective,
    this.environment,
    this.commitSha = '',
    this.quote = '',
  });

  static const maxQuote = 1000;
  static final _key = RegExp(r'^[a-z0-9][a-z0-9_-]{0,63}$');
  static final _sha = RegExp(r'^[0-9a-f]{40}$');

  final FleetIntentKind kind;
  final String? projectKey;
  final FleetTopic? topic;
  final String targetKey;
  final FleetPriority? priority;
  final FleetWorkTemplate? template;
  final FleetObjective? objective;
  final FleetEnvironment? environment;
  final String commitSha;
  final String quote;

  /// Another kind keeps the shared fields and drops the ones it does not
  /// send.
  FleetIntentDraft copyWith({
    FleetIntentKind? kind,
    String? projectKey,
    FleetTopic? topic,
    String? targetKey,
    FleetPriority? priority,
    FleetWorkTemplate? template,
    FleetObjective? objective,
    FleetEnvironment? environment,
    String? commitSha,
    String? quote,
  }) => FleetIntentDraft(
    kind: kind ?? this.kind,
    projectKey: projectKey ?? this.projectKey,
    topic: topic ?? this.topic,
    targetKey: targetKey ?? this.targetKey,
    priority: priority ?? this.priority,
    template: template ?? this.template,
    objective: objective ?? this.objective,
    environment: environment ?? this.environment,
    commitSha: commitSha ?? this.commitSha,
    quote: quote ?? this.quote,
  );

  String get _target => targetKey.trim();
  String get _commit => commitSha.trim();
  String get _quote => quote.trim();

  Map<FleetDraftField, FleetDraftError> validate() {
    final fields = kind.fields;
    final errors = <FleetDraftField, FleetDraftError>{};
    void choice(FleetDraftField field, Object? value) {
      if (fields.contains(field) && value == null) {
        errors[field] = FleetDraftError.required;
      }
    }

    if (projectKey == null) {
      errors[FleetDraftField.project] = FleetDraftError.required;
    }
    choice(FleetDraftField.topic, topic);
    choice(FleetDraftField.priority, priority);
    choice(FleetDraftField.template, template);
    choice(FleetDraftField.objective, objective);
    choice(FleetDraftField.environment, environment);
    if (fields.contains(FleetDraftField.target)) {
      if (_target.isEmpty) {
        errors[FleetDraftField.target] = FleetDraftError.required;
      } else if (!_key.hasMatch(_target)) {
        errors[FleetDraftField.target] = FleetDraftError.invalid;
      }
    }
    if (fields.contains(FleetDraftField.commitSha)) {
      if (_commit.isEmpty) {
        errors[FleetDraftField.commitSha] = FleetDraftError.required;
      } else if (!_sha.hasMatch(_commit)) {
        errors[FleetDraftField.commitSha] = FleetDraftError.invalid;
      }
    }
    if (_quote.length > maxQuote) {
      errors[FleetDraftField.quote] = FleetDraftError.tooLong;
    } else if (kind.requiresQuote && _quote.isEmpty) {
      errors[FleetDraftField.quote] = FleetDraftError.required;
    }
    return errors;
  }

  /// The `POST /api/v1/fleet/intents` body. Call only on a valid draft.
  Map<String, Object?> toJson() {
    assert(validate().isEmpty, 'Submit a valid draft only');
    final fields = kind.fields;
    return {
      'kind': kind.wire,
      'payload': {
        'projectKey': projectKey,
        if (fields.contains(FleetDraftField.target)) 'targetKey': _target,
        if (fields.contains(FleetDraftField.topic)) 'topic': topic!.name,
        if (fields.contains(FleetDraftField.priority))
          'priority': priority!.name,
        if (fields.contains(FleetDraftField.template))
          'template': template!.wire,
        if (fields.contains(FleetDraftField.objective))
          'objective': objective!.wire,
        if (kind == FleetIntentKind.approveDeploy)
          'environment': environment!.name,
        if (kind == FleetIntentKind.approveProductionChange)
          'environment': FleetEnvironment.production.name,
        if (fields.contains(FleetDraftField.commitSha)) 'commitSha': _commit,
      },
      if (_quote.isNotEmpty) 'quote': _quote,
    };
  }

  @override
  List<Object?> get props => [
    kind,
    projectKey,
    topic,
    targetKey,
    priority,
    template,
    objective,
    environment,
    commitSha,
    quote,
  ];
}
