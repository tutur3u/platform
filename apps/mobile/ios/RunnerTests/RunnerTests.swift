import Flutter
import UIKit
import XCTest
@testable import Runner

class RunnerTests: XCTestCase {

  func testVoiceActionPayloadIsTrustedWithoutPrompt() {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let action = AssistantShortcutAction.make(kind: .voice, prompt: "ignored", now: now)
    let payload = action.payload
    XCTAssertEqual(payload["kind"] as? String, "voice")
    XCTAssertEqual(payload["trusted"] as? Bool, true)
    XCTAssertEqual(payload["createdAtMs"] as? Int, 1_700_000_000_000)
    XCTAssertNil(payload["prompt"])
    XCTAssertFalse(action.id.isEmpty)
  }

  func testPromptActionTrimsAndBoundsText() {
    let blank = AssistantShortcutAction.make(kind: .prompt, prompt: "   ")
    XCTAssertNil(blank.prompt)
    let long = String(repeating: "a", count: AssistantShortcutAction.maxPromptLength + 10)
    let bounded = AssistantShortcutAction.make(kind: .prompt, prompt: "  \(long)  ")
    XCTAssertEqual(bounded.prompt?.count, AssistantShortcutAction.maxPromptLength)
  }

  func testInboxDrainsOnceAndSignals() {
    let inbox = AssistantShortcutInbox()
    var signals = 0
    inbox.onEnqueue = { signals += 1 }
    let first = AssistantShortcutAction.make(kind: .voice)
    inbox.enqueue(first)
    XCTAssertEqual(signals, 1)
    XCTAssertEqual(inbox.drain(), [first])
    XCTAssertEqual(inbox.drain(), [])
  }

  func testInboxKeepsNewestActionsWithinCapacity() {
    let inbox = AssistantShortcutInbox()
    let actions = (0...AssistantShortcutInbox.capacity).map { _ in
      AssistantShortcutAction.make(kind: .voice)
    }
    actions.forEach(inbox.enqueue)
    XCTAssertEqual(inbox.drain(), Array(actions.dropFirst()))
  }
}
