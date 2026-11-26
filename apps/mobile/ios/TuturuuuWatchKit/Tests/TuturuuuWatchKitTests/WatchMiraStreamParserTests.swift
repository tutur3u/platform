import Foundation
import XCTest
@testable import TuturuuuWatchKit

final class WatchMiraStreamParserTests: XCTestCase {
  func testChunkedUTF8AndDoneStopsParsing() {
    let parser = WatchMiraStreamParser()
    let full = """
    {"type":"assistant_delta","delta":"Xin chào, "}
    {"type":"assistant_part","part":{"type":"text","text":"hôm nay còn 2 việc."}}
    {"type":"done"}
    {"type":"assistant_delta","delta":"should-be-ignored"}
    """
    let bytes = Data(full.utf8)
    var events: [WatchMiraStreamEvent] = []

    // Feed 7 bytes at a time to exercise multi-byte Vietnamese UTF-8 chunk boundaries.
    var offset = 0
    while offset < bytes.count {
      let end = min(offset + 7, bytes.count)
      events.append(contentsOf: parser.addChunk(bytes.subdata(in: offset..<end)))
      offset = end
    }
    events.append(contentsOf: parser.finish())

    XCTAssertEqual(events, [
      .assistantDelta("Xin chào, "),
      .assistantDelta("hôm nay còn 2 việc."),
      .done,
    ])
  }

  func testPlainJSONFallbackPrefersStructuredAIParts() {
    let payload = """
    {
      "messages": [
        {"id": "u1", "kind": "user", "content": "hi"},
        {
          "id": "a1",
          "kind": "assistant",
          "content": "truncated preview",
          "metadata": {
            "ai": {
              "parts": [
                {"type": "reasoning", "text": "internal thought"},
                {"type": "text", "text": "Done. "},
                {"type": "text", "text": "Your 14:00 review is next."}
              ]
            }
          }
        }
      ]
    }
    """
    let text = WatchMiraStreamParser.parsePlainJSONResponse(Data(payload.utf8))
    XCTAssertEqual(text, "Done. Your 14:00 review is next.")
  }

  func testErrorEventSurfacesMessage() {
    let parser = WatchMiraStreamParser()
    let events = parser.addChunk(Data(#"{"type":"error","message":"Rate limit reached"}"#.utf8))
      + parser.finish()
    XCTAssertEqual(events, [.error("Rate limit reached")])
  }
}
