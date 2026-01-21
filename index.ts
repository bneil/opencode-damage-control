/**
 * OpenCode Damage Control Plugin
 * ===============================
 *
 * Security plugin that blocks dangerous commands and protects sensitive files.
 * Ported from Claude Code damage control hooks.
 *
 * Installation:
 *   1. Copy this folder to ~/.config/opencode/plugins/damage-control/
 *   2. OpenCode will auto-run `bun install` for dependencies
 *   3. Restart OpenCode
 *
 * Or symlink for development:
 *   ln -s /path/to/this/folder ~/.config/opencode/plugins/damage-control
 */

import type { Plugin } from "@opencode-ai/plugin"
import { dirname } from "path"
import { fileURLToPath } from "url"
import { loadConfig } from "./matchers/patterns"
import { checkBashCommand } from "./matchers/bash"
import { checkFilePath, checkFilePathZeroAccessOnly } from "./matchers/file"

// Get plugin directory for loading patterns.yaml
const __dirname = dirname(fileURLToPath(import.meta.url))

export const DamageControl: Plugin = async (ctx) => {
  // Load config once at startup
  const config = loadConfig(__dirname)

  // Log initialization
  await ctx.client.app.log({
    service: "damage-control",
    level: "info",
    message: `Damage Control loaded: ${config.bashToolPatterns.length} bash patterns, ${config.zeroAccessPaths.length} zero-access paths, ${config.readOnlyPaths.length} read-only paths, ${config.noDeletePaths.length} no-delete paths`,
  })

  return {
    "tool.execute.before": async (input, output) => {
      // =========================================================================
      // BASH TOOL - Shell command protection
      // =========================================================================
      if (input.tool === "bash") {
        const command = output.args?.command as string | undefined
        if (command) {
          const result = checkBashCommand(command, config)
          if (result.blocked) {
            await ctx.client.app.log({
              service: "damage-control",
              level: "warn",
              message: `BLOCKED bash: ${result.reason} | cmd: ${command.slice(0, 80)}${command.length > 80 ? "..." : ""}`,
            })
            throw new Error(`SECURITY: ${result.reason}`)
          }
        }
      }

      // =========================================================================
      // WRITE/EDIT/PATCH TOOLS - File modification protection
      // =========================================================================
      if (input.tool === "write" || input.tool === "edit" || input.tool === "patch") {
        // Try different property names that OpenCode might use
        const filePath = (output.args?.filePath ||
          output.args?.file_path ||
          output.args?.path) as string | undefined

        if (filePath) {
          const result = checkFilePath(filePath, config)
          if (result.blocked) {
            await ctx.client.app.log({
              service: "damage-control",
              level: "warn",
              message: `BLOCKED ${input.tool}: ${result.reason} | path: ${filePath}`,
            })
            throw new Error(`SECURITY: Blocked ${input.tool} to ${result.reason}: ${filePath}`)
          }
        }
      }

      // =========================================================================
      // READ TOOL - Sensitive file read protection (zero-access only)
      // =========================================================================
      if (input.tool === "read") {
        const filePath = (output.args?.filePath ||
          output.args?.file_path ||
          output.args?.path) as string | undefined

        if (filePath) {
          const result = checkFilePathZeroAccessOnly(filePath, config)
          if (result.blocked) {
            await ctx.client.app.log({
              service: "damage-control",
              level: "warn",
              message: `BLOCKED read: ${result.reason} | path: ${filePath}`,
            })
            throw new Error(`SECURITY: Blocked read of ${result.reason}: ${filePath}`)
          }
        }
      }

      // =========================================================================
      // GLOB/GREP/LIST TOOLS - Directory enumeration protection (zero-access)
      // =========================================================================
      if (input.tool === "glob" || input.tool === "grep" || input.tool === "list") {
        const targetPath = (output.args?.path ||
          output.args?.directory ||
          output.args?.dir) as string | undefined

        if (targetPath) {
          const result = checkFilePathZeroAccessOnly(targetPath, config)
          if (result.blocked) {
            await ctx.client.app.log({
              service: "damage-control",
              level: "warn",
              message: `BLOCKED ${input.tool}: ${result.reason} | path: ${targetPath}`,
            })
            throw new Error(`SECURITY: Blocked ${input.tool} on ${result.reason}: ${targetPath}`)
          }
        }
      }
    },
  }
}

// Default export for OpenCode plugin loader
export default DamageControl
