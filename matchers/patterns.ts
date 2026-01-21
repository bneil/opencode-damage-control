/**
 * Pattern Matching Utilities for OpenCode Damage Control
 * =======================================================
 *
 * Shared utilities for glob pattern matching and config loading.
 */

import { existsSync, readFileSync } from "fs"
import { dirname, join, basename } from "path"
import { homedir } from "os"
import { parse as parseYaml } from "yaml"

// =============================================================================
// TYPES
// =============================================================================

export interface BashPattern {
  pattern: string
  reason: string
  ask?: boolean
}

export interface Config {
  bashToolPatterns: BashPattern[]
  zeroAccessPaths: string[]
  readOnlyPaths: string[]
  noDeletePaths: string[]
}

export interface CheckResult {
  blocked: boolean
  reason: string
}

// =============================================================================
// GLOB PATTERN UTILITIES
// =============================================================================

export function isGlobPattern(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?") || pattern.includes("[")
}

/**
 * Convert glob pattern to regex for matching in commands.
 * Used for bash command checking where we need to find patterns in command strings.
 */
export function globToRegex(globPattern: string): string {
  let result = ""
  for (const char of globPattern) {
    if (char === "*") {
      result += "[^\\s/]*" // Match any chars except whitespace and path sep
    } else if (char === "?") {
      result += "[^\\s/]" // Match single char except whitespace and path sep
    } else if (".+^${}()|[]\\".includes(char)) {
      result += "\\" + char
    } else {
      result += char
    }
  }
  return result
}

/**
 * Match a string against a glob pattern.
 * Used for file path matching where we need exact matches.
 */
export function matchGlob(str: string, pattern: string): boolean {
  const regexPattern = pattern
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
    .replace(/\*/g, ".*") // * matches anything
    .replace(/\?/g, ".") // ? matches single char

  try {
    const regex = new RegExp(`^${regexPattern}$`, "i")
    return regex.test(str.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Match a file path against a pattern (supports both literal paths and globs).
 */
export function matchPath(filePath: string, pattern: string): boolean {
  const expandedPattern = pattern.replace(/^~/, homedir())
  const normalized = filePath.replace(/^~/, homedir())

  if (isGlobPattern(pattern)) {
    // Glob pattern matching (case-insensitive for security)
    const fileBasename = basename(normalized)
    if (matchGlob(fileBasename, expandedPattern) || matchGlob(fileBasename, pattern)) {
      return true
    }
    // Also try full path match
    if (matchGlob(normalized, expandedPattern)) {
      return true
    }
    return false
  } else {
    // Prefix matching (original behavior for directories)
    if (normalized.startsWith(expandedPattern) || normalized === expandedPattern.replace(/\/$/, "")) {
      return true
    }
    return false
  }
}

// =============================================================================
// OPERATION PATTERNS - Define what operations to block for different path types
// =============================================================================

type PatternTuple = [string, string] // [pattern, operation]

// Operations blocked for READ-ONLY paths (all modifications)
const WRITE_PATTERNS: PatternTuple[] = [
  [">\\s*{path}", "write"],
  ["\\btee\\s+(?!.*-a).*{path}", "write"],
]

const APPEND_PATTERNS: PatternTuple[] = [
  [">>\\s*{path}", "append"],
  ["\\btee\\s+-a\\s+.*{path}", "append"],
  ["\\btee\\s+.*-a.*{path}", "append"],
]

const EDIT_PATTERNS: PatternTuple[] = [
  ["\\bsed\\s+-i.*{path}", "edit"],
  ["\\bperl\\s+-[^\\s]*i.*{path}", "edit"],
  ["\\bawk\\s+-i\\s+inplace.*{path}", "edit"],
]

const MOVE_COPY_PATTERNS: PatternTuple[] = [
  ["\\bmv\\s+.*\\s+{path}", "move"],
  ["\\bcp\\s+.*\\s+{path}", "copy"],
]

const DELETE_PATTERNS: PatternTuple[] = [
  ["\\brm\\s+.*{path}", "delete"],
  ["\\bunlink\\s+.*{path}", "delete"],
  ["\\brmdir\\s+.*{path}", "delete"],
  ["\\bshred\\s+.*{path}", "delete"],
]

const PERMISSION_PATTERNS: PatternTuple[] = [
  ["\\bchmod\\s+.*{path}", "chmod"],
  ["\\bchown\\s+.*{path}", "chown"],
  ["\\bchgrp\\s+.*{path}", "chgrp"],
]

const TRUNCATE_PATTERNS: PatternTuple[] = [
  ["\\btruncate\\s+.*{path}", "truncate"],
  [":\\s*>\\s*{path}", "truncate"],
]

// Combined patterns for read-only paths (block ALL modifications)
export const READ_ONLY_BLOCKED: PatternTuple[] = [
  ...WRITE_PATTERNS,
  ...APPEND_PATTERNS,
  ...EDIT_PATTERNS,
  ...MOVE_COPY_PATTERNS,
  ...DELETE_PATTERNS,
  ...PERMISSION_PATTERNS,
  ...TRUNCATE_PATTERNS,
]

// Patterns for no-delete paths (block ONLY delete operations)
export const NO_DELETE_BLOCKED: PatternTuple[] = DELETE_PATTERNS

// =============================================================================
// PATH PATTERN CHECKING (for bash commands)
// =============================================================================

export function checkPathPatterns(
  command: string,
  path: string,
  patterns: PatternTuple[],
  pathType: string
): CheckResult {
  if (isGlobPattern(path)) {
    // Glob pattern - convert to regex for command matching
    const globRegex = globToRegex(path)
    for (const [patternTemplate, operation] of patterns) {
      try {
        const cmdPrefix = patternTemplate.replace("{path}", "")
        if (cmdPrefix) {
          const regex = new RegExp(cmdPrefix + globRegex, "i")
          if (regex.test(command)) {
            return {
              blocked: true,
              reason: `Blocked: ${operation} operation on ${pathType} ${path}`,
            }
          }
        }
      } catch {
        continue
      }
    }
  } else {
    // Literal path matching (prefix-based)
    const expanded = path.replace(/^~/, homedir())
    const escapedExpanded = expanded.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const escapedOriginal = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

    for (const [patternTemplate, operation] of patterns) {
      const patternExpanded = patternTemplate.replace("{path}", escapedExpanded)
      const patternOriginal = patternTemplate.replace("{path}", escapedOriginal)
      try {
        const regexExpanded = new RegExp(patternExpanded)
        const regexOriginal = new RegExp(patternOriginal)
        if (regexExpanded.test(command) || regexOriginal.test(command)) {
          return {
            blocked: true,
            reason: `Blocked: ${operation} operation on ${pathType} ${path}`,
          }
        }
      } catch {
        continue
      }
    }
  }

  return { blocked: false, reason: "" }
}

// =============================================================================
// CONFIGURATION LOADING
// =============================================================================

let cachedConfig: Config | null = null

export function loadConfig(pluginDir: string): Config {
  if (cachedConfig) {
    return cachedConfig
  }

  const configPath = join(pluginDir, "patterns.yaml")

  if (!existsSync(configPath)) {
    console.error(`[damage-control] Warning: Config not found at ${configPath}`)
    return {
      bashToolPatterns: [],
      zeroAccessPaths: [],
      readOnlyPaths: [],
      noDeletePaths: [],
    }
  }

  const content = readFileSync(configPath, "utf-8")
  const config = parseYaml(content) as Partial<Config>

  cachedConfig = {
    bashToolPatterns: config.bashToolPatterns || [],
    zeroAccessPaths: config.zeroAccessPaths || [],
    readOnlyPaths: config.readOnlyPaths || [],
    noDeletePaths: config.noDeletePaths || [],
  }

  return cachedConfig
}

/**
 * Force reload config (useful for testing or hot-reload scenarios)
 */
export function reloadConfig(): void {
  cachedConfig = null
}
