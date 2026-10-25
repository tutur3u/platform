import AppIntents
import Foundation

// App Intents run in the app process. `openAppWhenRun` brings Tuturuuu to the
// foreground, which iOS only allows on an unlocked device: from the lock
// screen the system asks for Face ID, Touch ID or the passcode first. The
// Flutter side additionally waits for sign-in, the in-app lock and a
// workspace before Live opens the microphone.

@available(iOS 16.0, *)
struct StartMiraVoiceChatIntent: AppIntent {
  static let title: LocalizedStringResource = "Start Mira voice chat"
  static let description = IntentDescription("Opens Mira Live in Tuturuuu and starts a voice chat.")
  static let openAppWhenRun = true
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  @MainActor
  func perform() async throws -> some IntentResult {
    AssistantShortcutInbox.shared.enqueue(.make(kind: .voice))
    return .result()
  }
}

@available(iOS 16.0, *)
struct AskMiraIntent: AppIntent {
  static let title: LocalizedStringResource = "Ask Mira"
  static let description = IntentDescription("Opens Mira in Tuturuuu and sends your question.")
  static let openAppWhenRun = true
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  @Parameter(title: "Question", requestValueDialog: "What do you want to ask Mira?")
  var prompt: String

  static var parameterSummary: some ParameterSummary {
    Summary("Ask Mira \(\.$prompt)")
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    AssistantShortcutInbox.shared.enqueue(.make(kind: .prompt, prompt: prompt))
    return .result()
  }
}

@available(iOS 16.0, *)
struct MiraAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: StartMiraVoiceChatIntent(),
      phrases: [
        "Start Mira voice chat in \(.applicationName)",
        "Talk to Mira in \(.applicationName)",
        "Call Mira in \(.applicationName)",
      ]
    )
    AppShortcut(
      intent: AskMiraIntent(),
      phrases: [
        "Ask Mira in \(.applicationName)",
      ]
    )
  }
}
