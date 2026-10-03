import 'package:mobile/features/assistant/models/assistant_models.dart';

/// Picker eligibility accepts both gateway-qualified and bare model IDs.
/// An empty allowlist is unrestricted, but disabled models stay unavailable.
bool isAssistantModelAllowed(
  AssistantGatewayModel model,
  List<String> allowedModels,
) =>
    !model.disabled &&
    (allowedModels.isEmpty ||
        allowedModels.contains(model.value) ||
        allowedModels.contains(model.value.split('/').last));
