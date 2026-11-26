#!/usr/bin/env swift
import Foundation

// Omits the embedded TuturuuuWatch target from Runner when manual TestFlight signing
// does not have watch/widget App Store provisioning profiles configured in the vault.

let args = CommandLine.arguments
guard args.count == 2 else {
  FileHandle.standardError.write(Data("Usage: omit-watch-targets.swift <path/to/Runner.xcodeproj>\n".utf8))
  exit(1)
}

let projectURL = URL(fileURLWithPath: args[1]).appendingPathComponent("project.pbxproj")
guard var contents = try? String(contentsOf: projectURL, encoding: .utf8) else {
  FileHandle.standardError.write(Data("Failed to read \(projectURL.path)\n".utf8))
  exit(1)
}

let embedPhaseId = "W10000010000000000000040"
let watchDependencyId = "W10000010000000000000042"
let embedBuildFileId = "W10000010000000000000041"

guard contents.contains(embedPhaseId), contents.contains(watchDependencyId) else {
  FileHandle.standardError.write(Data("Watch embed phase or target dependency not found in project.pbxproj\n".utf8))
  exit(1)
}

/// Removes a single balanced `<id> /* ... */ = { ... };` pbxproj object definition
/// without disturbing sibling entries even if adjacent on the same line.
func removeDefinition(id: String, in text: inout String) {
  let pattern = "[\\t ]*\(id)(?:[ ]*/\\*[^*]*\\*/)?[ ]*=[ ]*\\{"
  guard let regex = try? NSRegularExpression(pattern: pattern) else { return }

  while true {
    let nsRange = NSRange(text.startIndex..<text.endIndex, in: text)
    guard let match = regex.firstMatch(in: text, range: nsRange),
          let matchRange = Range(match.range, in: text) else {
      break
    }
    // Walk forward from the opening '{' tracking brace depth until the matching '}'.
    var idx = text.index(before: matchRange.upperBound)
    var depth = 0
    var endIdx: String.Index?
    while idx < text.endIndex {
      let ch = text[idx]
      if ch == "{" {
        depth += 1
      } else if ch == "}" {
        depth -= 1
        if depth == 0 {
          var after = text.index(after: idx)
          if after < text.endIndex && text[after] == ";" {
            after = text.index(after: after)
          }
          if after < text.endIndex && text[after] == "\n" {
            after = text.index(after: after)
          }
          endIdx = after
          break
        }
      }
      idx = text.index(after: idx)
    }
    guard let removalEnd = endIdx else { break }
    text.removeSubrange(matchRange.lowerBound..<removalEnd)
  }
}

func removeListReferences(id: String, in text: inout String) {
  let pattern = "^[\\t ]*\(id)(?:[ ]*/\\*[^*]*\\*/)?,\\n"
  guard let regex = try? NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines]) else {
    return
  }
  let nsRange = NSRange(text.startIndex..<text.endIndex, in: text)
  text = regex.stringByReplacingMatches(in: text, options: [], range: nsRange, withTemplate: "")
}

removeDefinition(id: embedPhaseId, in: &contents)
removeDefinition(id: watchDependencyId, in: &contents)
removeDefinition(id: embedBuildFileId, in: &contents)
removeListReferences(id: embedPhaseId, in: &contents)
removeListReferences(id: watchDependencyId, in: &contents)
removeListReferences(id: embedBuildFileId, in: &contents)

guard !contents.contains(embedPhaseId),
      !contents.contains(watchDependencyId),
      !contents.contains(embedBuildFileId) else {
  FileHandle.standardError.write(Data("Failed to remove Watch embed references from project.pbxproj\n".utf8))
  exit(1)
}

try contents.write(to: projectURL, atomically: true, encoding: .utf8)
print("Omitted TuturuuuWatch from the iOS TestFlight Runner target.")
