import Flutter
import Foundation

/// A Siri/Shortcuts request for the Flutter assistant entry point.
struct AssistantShortcutAction: Equatable {
  enum Kind: String { case voice, prompt }

  static let maxPromptLength = 4000

  let id: String
  let kind: Kind
  let prompt: String?
  let createdAt: Date

  static func make(kind: Kind, prompt: String? = nil, now: Date = Date()) -> AssistantShortcutAction {
    var text = prompt?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let value = text, value.isEmpty { text = nil }
    if let value = text, value.count > maxPromptLength { text = String(value.prefix(maxPromptLength)) }
    return AssistantShortcutAction(
      id: UUID().uuidString, kind: kind, prompt: kind == .prompt ? text : nil, createdAt: now)
  }

  /// App Intents are only invocable by the user through Siri, Shortcuts or
  /// Spotlight, so iOS actions are trusted.
  var payload: [String: Any] {
    var value: [String: Any] = [
      "id": id,
      "kind": kind.rawValue,
      "trusted": true,
      "createdAtMs": Int(createdAt.timeIntervalSince1970 * 1000),
    ]
    if let prompt = prompt { value["prompt"] = prompt }
    return value
  }
}

/// Holds shortcut actions until Dart drains them. Works before the Flutter
/// engine exists (cold start) and signals Dart when one arrives warm.
final class AssistantShortcutInbox {
  static let shared = AssistantShortcutInbox()
  static let capacity = 4

  private let lock = NSLock()
  private var pending: [AssistantShortcutAction] = []
  var onEnqueue: (() -> Void)?

  func enqueue(_ action: AssistantShortcutAction) {
    lock.lock()
    pending.append(action)
    if pending.count > AssistantShortcutInbox.capacity { pending.removeFirst() }
    let notify = onEnqueue
    lock.unlock()
    notify?()
  }

  func drain() -> [AssistantShortcutAction] {
    lock.lock()
    defer { lock.unlock() }
    let actions = pending
    pending.removeAll()
    return actions
  }
}

final class AssistantShortcutsPlugin: NSObject, FlutterPlugin {
  static let channelName = "mobile/assistant_shortcuts"

  private let inbox: AssistantShortcutInbox

  init(inbox: AssistantShortcutInbox = .shared) {
    self.inbox = inbox
  }

  static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(name: channelName, binaryMessenger: registrar.messenger())
    let instance = AssistantShortcutsPlugin()
    registrar.addMethodCallDelegate(instance, channel: channel)
    // Payload-free signal; Dart always drains through `takePending`.
    instance.inbox.onEnqueue = { [weak channel] in
      DispatchQueue.main.async { channel?.invokeMethod("pendingAvailable", arguments: nil) }
    }
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "takePending": result(inbox.drain().map { $0.payload })
    default: result(FlutterMethodNotImplemented)
    }
  }
}
