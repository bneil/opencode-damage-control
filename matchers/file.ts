/**
 * File Path Checker for OpenCode Damage Control
 * ==============================================
 *
 * Checks file paths against security patterns for read/write/edit operations.
 */

import { type Config, type CheckResult, matchPath } from "./patterns"

/**
 * Check a file path for write/edit operations.
 * Blocks access to:
 * - zeroAccessPaths (no operations allowed)
 * - readOnlyPaths (no modifications allowed)
 */
export function checkFilePath(filePath: string, config: Config): CheckResult {
  // Check zero-access paths first (highest priority)
  for (const zeroPath of config.zeroAccessPaths) {
    if (matchPath(filePath, zeroPath)) {
      return {
        blocked: true,
        reason: `zero-access path ${zeroPath} (no operations allowed)`,
      }
    }
  }

  // Check read-only paths
  for (const readonlyPath of config.readOnlyPaths) {
    if (matchPath(filePath, readonlyPath)) {
      return {
        blocked: true,
        reason: `read-only path ${readonlyPath}`,
      }
    }
  }

  return { blocked: false, reason: "" }
}

/**
 * Check a file path for read operations.
 * Only blocks access to zeroAccessPaths.
 * Read operations are allowed on readOnlyPaths (that's the point).
 */
export function checkFilePathZeroAccessOnly(filePath: string, config: Config): CheckResult {
  for (const zeroPath of config.zeroAccessPaths) {
    if (matchPath(filePath, zeroPath)) {
      return {
        blocked: true,
        reason: `zero-access path ${zeroPath} (no operations allowed)`,
      }
    }
  }

  return { blocked: false, reason: "" }
}
