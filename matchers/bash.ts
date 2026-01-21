/**
 * Bash Command Checker for OpenCode Damage Control
 * =================================================
 *
 * Checks shell commands against security patterns.
 */

import { homedir } from "os"
import {
  type Config,
  type CheckResult,
  isGlobPattern,
  globToRegex,
  checkPathPatterns,
  READ_ONLY_BLOCKED,
  NO_DELETE_BLOCKED,
} from "./patterns"

export interface BashCheckResult extends CheckResult {
  // In Claude Code, "ask" triggers a confirmation dialog.
  // In OpenCode, we just block (stricter security).
  // This field is kept for potential future use.
  wasAskPattern?: boolean
}

/**
 * Check a bash command against all security patterns.
 *
 * Order of checks:
 * 1. bashToolPatterns - explicit dangerous command patterns (rm -rf, git push --force, etc.)
 * 2. zeroAccessPaths - block ANY access (read, write, execute) to sensitive paths
 * 3. readOnlyPaths - block modifications but allow reads
 * 4. noDeletePaths - block deletions only
 */
export function checkBashCommand(command: string, config: Config): BashCheckResult {
  // 1. Check against explicit patterns from YAML
  for (const { pattern, reason, ask: shouldAsk } of config.bashToolPatterns) {
    try {
      const regex = new RegExp(pattern, "i")
      if (regex.test(command)) {
        // In OpenCode, we block "ask" patterns too (stricter than Claude Code)
        return {
          blocked: true,
          reason: `Blocked: ${reason}`,
          wasAskPattern: shouldAsk === true,
        }
      }
    } catch {
      // Invalid regex, skip
      continue
    }
  }

  // 2. Check for ANY access to zero-access paths (including reads)
  for (const zeroPath of config.zeroAccessPaths) {
    if (isGlobPattern(zeroPath)) {
      // Convert glob to regex for command matching
      const globRegex = globToRegex(zeroPath)
      try {
        const regex = new RegExp(globRegex, "i")
        if (regex.test(command)) {
          return {
            blocked: true,
            reason: `Blocked: zero-access pattern ${zeroPath} (no operations allowed)`,
          }
        }
      } catch {
        continue
      }
    } else {
      // Literal path matching
      const expanded = zeroPath.replace(/^~/, homedir())
      if (command.includes(expanded) || command.includes(zeroPath)) {
        return {
          blocked: true,
          reason: `Blocked: zero-access path ${zeroPath} (no operations allowed)`,
        }
      }
    }
  }

  // 3. Check for modifications to read-only paths (reads allowed)
  for (const readonlyPath of config.readOnlyPaths) {
    const result = checkPathPatterns(command, readonlyPath, READ_ONLY_BLOCKED, "read-only path")
    if (result.blocked) {
      return result
    }
  }

  // 4. Check for deletions on no-delete paths (read/write/edit allowed)
  for (const noDeletePath of config.noDeletePaths) {
    const result = checkPathPatterns(command, noDeletePath, NO_DELETE_BLOCKED, "no-delete path")
    if (result.blocked) {
      return result
    }
  }

  return { blocked: false, reason: "" }
}
