import Foundation

public enum WatchMiraStreamEvent: Sendable, Equatable {
  case assistantDelta(String)
  case assistantFinalText(String)
  case done
  case error(String)
}

/// Parses Tuturuuu native AI chat NDJSON streams (`application/x-ndjson`) and JSON fallbacks.
public final class WatchMiraStreamParser {
  private var buffer = Data()
  private var isDone = false

  public init() {}

  public func addChunk(_ chunk: Data) -> [WatchMiraStreamEvent] {
    guard !isDone, !chunk.isEmpty else { return [] }
    buffer.append(chunk)
    return drainLines(flushRemaining: false)
  }

  public func finish() -> [WatchMiraStreamEvent] {
    guard !isDone else { return [] }
    return drainLines(flushRemaining: true)
  }

  private func drainLines(flushRemaining: Bool) -> [WatchMiraStreamEvent] {
    var events: [WatchMiraStreamEvent] = []
    let newline: UInt8 = 0x0A

    while let range = buffer.firstRange(of: Data([newline])) {
      let lineData = buffer.subdata(in: buffer.startIndex..<range.lowerBound)
      buffer.removeSubrange(buffer.startIndex..<range.upperBound)
      if let event = parseLine(lineData) {
        events.append(event)
        if case .done = event {
          isDone = true
          buffer.removeAll()
          return events
        }
      }
    }

    if flushRemaining && !buffer.isEmpty {
      let remaining = buffer
      buffer.removeAll()
      if let event = parseLine(remaining) {
        events.append(event)
      }
    }

    return events
  }

  private func parseLine(_ lineData: Data) -> WatchMiraStreamEvent? {
    guard let line = String(data: lineData, encoding: .utf8)?
      .trimmingCharacters(in: .whitespacesAndNewlines),
      !line.isEmpty,
      let trimmedData = line.data(using: .utf8),
      let json = try? JSONSerialization.jsonObject(with: trimmedData) as? [String: Any] else {
      return nil
    }

    guard let type = json["type"] as? String else { return nil }
    switch type {
    case "assistant_delta":
      guard let delta = json["delta"] as? String, !delta.isEmpty else { return nil }
      return .assistantDelta(delta)
    case "assistant_part":
      guard let part = json["part"] as? [String: Any],
            (part["type"] as? String) == "text",
            let text = part["text"] as? String,
            !text.isEmpty else {
        return nil
      }
      return .assistantDelta(text)
    case "message":
      if let message = json["message"] as? [String: Any],
         let text = Self.extractAssistantText(from: message) {
        return .assistantFinalText(text)
      }
      return nil
    case "messages":
      if let messages = json["messages"] as? [[String: Any]],
         let text = Self.extractLatestAssistantText(from: messages) {
        return .assistantFinalText(text)
      }
      return nil
    case "done":
      return .done
    case "error":
      let message = (json["message"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      return .error((message?.isEmpty == false ? message! : "Mira request failed"))
    default:
      return nil
    }
  }

  /// Extracts assistant reply text from a non-streaming JSON response body.
  public static func parsePlainJSONResponse(_ data: Data) -> String? {
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return nil
    }
    if let messages = json["messages"] as? [[String: Any]],
       let text = extractLatestAssistantText(from: messages) {
      return text
    }
    if let message = json["message"] as? [String: Any],
       let text = extractAssistantText(from: message) {
      return text
    }
    return nil
  }

  /// Prefers structured `metadata.ai.parts` text over legacy `parts` or flat `content`.
  public static func extractAssistantText(from message: [String: Any]) -> String? {
    let kind = (message["kind"] as? String) ?? (message["role"] as? String)
    guard kind == "assistant" else { return nil }

    if let metadata = message["metadata"] as? [String: Any],
       let ai = metadata["ai"] as? [String: Any],
       let parts = ai["parts"] as? [[String: Any]] {
      let joined = joinTextParts(parts)
      if !joined.isEmpty { return joined }
    }

    if let parts = message["parts"] as? [[String: Any]] {
      let joined = joinTextParts(parts)
      if !joined.isEmpty { return joined }
    }

    if let content = message["content"] as? String {
      let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty { return trimmed }
    }
    return nil
  }

  public static func extractLatestAssistantText(from messages: [[String: Any]]) -> String? {
    for message in messages.reversed() {
      if let text = extractAssistantText(from: message) {
        return text
      }
    }
    return nil
  }

  private static func joinTextParts(_ parts: [[String: Any]]) -> String {
    parts
      .compactMap { part -> String? in
        guard (part["type"] as? String) == "text" else { return nil }
        return part["text"] as? String
      }
      .joined()
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
