import type { ToolName, ModeConfig, ExperimentId, GroupOptions, GroupEntry } from "@roo-code/types"
import { toolNames as validToolNames } from "@roo-code/types"
import { customToolRegistry } from "@roo-code/core"
import * as vscode from "vscode"
import * as path from "path"
import { minimatch } from "minimatch"

import { type Mode, FileRestrictionError, getModeBySlug, getGroupName } from "../../shared/modes"
import { EXPERIMENT_IDS } from "../../shared/experiments"
import { TOOL_GROUPS, ALWAYS_AVAILABLE_TOOLS, TOOL_ALIASES } from "../../shared/tools"

// ============================================================================
// GOVERNANCE CONSTANTS - PHASE 1 & 2 GATES
// ============================================================================

/**
 * Tools that modify the filesystem or execute commands (need intent)
 */
export const DESTRUCTIVE_TOOLS: ToolName[] = [
	"write_to_file",
	"apply_diff",
	"edit",
	"search_and_replace",
	"search_replace",
	"edit_file",
	"apply_patch",
	"execute_command",
	"generate_image",
]

/**
 * Tools that are safe to run without an active intent
 */
export const SAFE_WITHOUT_INTENT: ToolName[] = [
	"read_file",
	"list_files",
	"search_files",
	"codebase_search",
	"ask_followup_question",
	"attempt_completion",
	"select_active_intent", // Special case - this tool SETS the intent
]

/**
 * Check if a tool is destructive (requires intent)
 */
export function isDestructiveTool(toolName: ToolName): boolean {
	return DESTRUCTIVE_TOOLS.includes(toolName)
}





const INTENT_IGNORE_LIST = [
    ".orchestration/**",
    ".env",
    ".git/**",
    "node_modules/**"
]

function isPathProtected(filePath: string): { protected: boolean; reason?: string } {
    const normalizedPath = filePath.replace(/\\/g, "/")
    
    const isIgnored = INTENT_IGNORE_LIST.some(pattern => 
        minimatch(normalizedPath, pattern, { dot: true, matchBase: true })
    )

    if (isIgnored) {
        return {
            protected: true,
            reason: `🔒 CONSTITUTIONAL BLOCK: The path "${normalizedPath}" is a protected system resource and cannot be modified by the AI under any intent.`
        }
    }
    return { protected: false }
}

// ============================================================================
// PHASE 1 GATE: INTENT VALIDATION
// ============================================================================

/**
 * Validates that destructive tools have an active intent
 * This is the Phase 1 Gate from the governance architecture
 *
 * @param toolName - The tool being called
 * @param activeIntentId - The currently active intent ID (or null)
 * @returns Validation result with allowed status and reason if blocked
 */
export function validateIntentForTool(
	toolName: ToolName,
	activeIntentId: string | null,
): { allowed: boolean; reason?: string } {
	// Special case: intent selection tool is ALWAYS allowed
	if (toolName === "select_active_intent") {
		return { allowed: true }
	}

	// Check if this is a destructive tool
	const isDestructive = isDestructiveTool(toolName)

	// PHASE 1 GATE: No intent for destructive tool = BLOCK
	if (isDestructive && !activeIntentId) {
		return {
			allowed: false,
			reason: `🔒 PHASE 1 GATE BLOCKED: No active intent selected. You MUST call 'select_active_intent' before using ${toolName}. Available intents can be found in .orchestration/active_intents.yaml`,
		}
	}

	return { allowed: true }
}

// ============================================================================
// PHASE 2 GATE: SCOPE VALIDATION
// ============================================================================

/**
 * Interface for intent data from active_intents.yaml
 */
interface IntentData {
	id: string
	name: string
	status: string
	owned_scope: string[]
	constraints?: string[]
	acceptance_criteria?: string[]
}

/**
 * Load intent data from .orchestration/active_intents.yaml
 */
async function loadIntentData(workspaceRoot: string, intentId: string): Promise<IntentData | null> {
	try {
		const fs = require("fs/promises")
		const yaml = require("yaml")
		const intentPath = path.join(workspaceRoot, ".orchestration", "active_intents.yaml")

		const content = await fs.readFile(intentPath, "utf-8")
		const data = yaml.parse(content)

		const intent = data.active_intents?.find((i: IntentData) => i.id === intentId)
		return intent || null
	} catch (error) {
		console.error(`Error loading intent data for ${intentId}:`, error)
		return null
	}
}

/**
 * Extract file path from tool parameters
 * Different tools use different parameter names
 */
function extractFilePathFromParams(toolName: ToolName, params?: Record<string, unknown>): string | undefined {
	if (!params) return undefined

	// Check common parameter names for file paths
	if (params.path && typeof params.path === "string") return params.path
	if (params.file_path && typeof params.file_path === "string") return params.file_path
	if (params.destination && typeof params.destination === "string") return params.destination

	// Special handling for apply_patch - extract from patch content
	if (toolName === "apply_patch" && params.patch && typeof params.patch === "string") {
		// This would need more sophisticated parsing, but for now return undefined
		// and let the scope validation handle it in a more complex way if needed
	}

	return undefined
}

/**
 * Check if a file path matches any scope pattern
 * Uses minimatch for glob pattern matching
 */
function isPathInScope(filePath: string, scopePatterns: string[]): boolean {
	// Normalize path to use forward slashes
	const normalizedPath = filePath.replace(/\\/g, "/")

	return scopePatterns.some((pattern) => {
		// Normalize pattern
		const normalizedPattern = pattern.replace(/\\/g, "/")

		// Use minimatch for glob matching
		return minimatch(normalizedPath, normalizedPattern, { matchBase: true })
	})
}

/**
 * PHASE 2 GATE: Validate that file operations stay within intent scope
 *
 * @param toolName - The tool being called
 * @param params - Tool parameters
 * @param activeIntentId - The active intent ID
 * @param workspaceRoot - Root path of the workspace
 * @returns Validation result with allowed status and reason if blocked
 */
export async function validateScopeForTool(
	toolName: ToolName,
	params: Record<string, unknown> | undefined,
	activeIntentId: string,
	workspaceRoot: string,
): Promise<{ allowed: boolean; reason?: string }> {
	// Only validate destructive tools
	if (!isDestructiveTool(toolName)) {
		return { allowed: true }
	}

	// Extract file path from params
	const filePath = extractFilePathFromParams(toolName, params)
	if (!filePath) {
		// If no file path, can't validate scope - but this might be intentional
		// (e.g., execute_command with no file path)
		return { allowed: true }
	}

	try {
		// Load intent data
		const intent = await loadIntentData(workspaceRoot, activeIntentId)
		if (!intent) {
			return {
				allowed: false,
				reason: `🔒 PHASE 2 GATE BLOCKED: Intent "${activeIntentId}" not found in .orchestration/active_intents.yaml`,
			}
		}

		// Check if file is in scope
		const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath)
		const relativePath = path.relative(workspaceRoot, fullPath)

		if (!isPathInScope(relativePath, intent.owned_scope)) {
			return {
				allowed: false,
				reason: `🔒 PHASE 2 GATE BLOCKED: File "${relativePath}" is outside intent "${activeIntentId}" scope. Allowed scope: ${intent.owned_scope.join(", ")}`,
			}
		}

		return { allowed: true }
	} catch (error) {
		console.error("Error in scope validation:", error)
		// Fail closed - if we can't validate, block for safety
		return {
			allowed: false,
			reason: `🔒 PHASE 2 GATE ERROR: Could not validate scope due to internal error. Please check .orchestration/ files.`,
		}
	}
}

// ============================================================================
// COMPREHENSIVE GOVERNANCE VALIDATION
// ============================================================================

/**
 * Complete governance validation combining Phase 1 and Phase 2 gates
 *
 * @param toolName - The tool being called
 * @param activeIntentId - Current active intent (or null)
 * @param params - Tool parameters
 * @param workspaceRoot - Workspace root path
 * @returns Validation result
 */
export async function validateGovernance(
    toolName: ToolName,
    activeIntentId: string | null,
    params?: Record<string, unknown>,
    workspaceRoot?: string,
): Promise<{ allowed: boolean; reason?: string }> {
    
    // 👇 NEW: CONSTITUTIONAL GATE (Check this first!)
    const filePath = extractFilePathFromParams(toolName, params)
    if (filePath && isDestructiveTool(toolName)) {
        const protection = isPathProtected(filePath)
        if (protection.protected) {
            return { allowed: false, reason: protection.reason }
        }
    }

    // PHASE 1 GATE: Intent validation (Existing)
    const intentValidation = validateIntentForTool(toolName, activeIntentId)
    if (!intentValidation.allowed) {
        return intentValidation
    }

    // PHASE 2 GATE: Scope validation (Existing)
    if (activeIntentId && workspaceRoot) {
        const scopeValidation = await validateScopeForTool(toolName, params, activeIntentId, workspaceRoot)
        if (!scopeValidation.allowed) {
            return scopeValidation
        }
    }

    return { allowed: true }
}

// ============================================================================
// ORIGINAL VALIDATION FUNCTIONS (PRESERVED)
// ============================================================================

/**
 * Checks if a tool name is a valid, known tool.
 * Note: This does NOT check if the tool is allowed for a specific mode,
 * only that the tool actually exists.
 */
export function isValidToolName(toolName: string, experiments?: Record<string, boolean>): toolName is ToolName {
	// Check if it's a valid static tool
	if ((validToolNames as readonly string[]).includes(toolName)) {
		return true
	}

	if (experiments?.customTools && customToolRegistry.has(toolName)) {
		return true
	}

	// Check if it's a dynamic MCP tool (mcp_serverName_toolName format).
	if (toolName.startsWith("mcp_")) {
		return true
	}

	return false
}

/**
 * Main validation function used by the system
 * Enhanced with governance checks
 */
export async function validateToolUse(
	toolName: ToolName,
	mode: Mode,
	customModes?: ModeConfig[],
	toolRequirements?: Record<string, boolean>,
	toolParams?: Record<string, unknown>,
	experiments?: Record<string, boolean>,
	includedTools?: string[],
	// Governance parameters
	activeIntentId?: string | null,
	workspaceRoot?: string,
): Promise<void> {
	// ===== GOVERNANCE VALIDATION =====
	// Run Phase 1 and Phase 2 gates
	const governanceValidation = await validateGovernance(toolName, activeIntentId || null, toolParams, workspaceRoot)

	if (!governanceValidation.allowed) {
		throw new Error(governanceValidation.reason)
	}

	// ===== ORIGINAL VALIDATION =====
	// First, check if the tool name is actually a valid/known tool
	if (!isValidToolName(toolName, experiments)) {
		throw new Error(
			`Unknown tool "${toolName}". This tool does not exist. Please use one of the available tools: ${validToolNames.join(", ")}.`,
		)
	}

	// Then check if the tool is allowed for the current mode
	if (
		!isToolAllowedForMode(
			toolName,
			mode,
			customModes ?? [],
			toolRequirements,
			toolParams,
			experiments,
			includedTools,
		)
	) {
		throw new Error(`Tool "${toolName}" is not allowed in ${mode} mode.`)
	}
}

// ============================================================================
// ORIGINAL MODE VALIDATION FUNCTIONS (UNCHANGED)
// ============================================================================

const EDIT_OPERATION_PARAMS = [
	"diff",
	"content",
	"operations",
	"search",
	"replace",
	"args",
	"line",
	"patch",
	"old_string",
	"new_string",
] as const

const PATCH_FILE_MARKERS = ["*** Add File: ", "*** Delete File: ", "*** Update File: "] as const

/**
 * Extract file paths from apply_patch content.
 */
function extractFilePathsFromPatch(patchContent: string): string[] {
	const filePaths: string[] = []
	const lines = patchContent.split("\n")

	for (const line of lines) {
		for (const marker of PATCH_FILE_MARKERS) {
			if (line.startsWith(marker)) {
				const path = line.substring(marker.length).trim()
				if (path) {
					filePaths.push(path)
				}
				break
			}
		}
	}

	return filePaths
}

function getGroupOptions(group: GroupEntry): GroupOptions | undefined {
	return Array.isArray(group) ? group[1] : undefined
}

function doesFileMatchRegex(filePath: string, pattern: string): boolean {
	try {
		const regex = new RegExp(pattern)
		return regex.test(filePath)
	} catch (error) {
		console.error(`Invalid regex pattern: ${pattern}`, error)
		return false
	}
}

export function isToolAllowedForMode(
	tool: string,
	modeSlug: string,
	customModes: ModeConfig[],
	toolRequirements?: Record<string, boolean>,
	toolParams?: Record<string, any>,
	experiments?: Record<string, boolean>,
	includedTools?: string[],
): boolean {
	// Resolve alias to canonical name
	const resolvedTool = TOOL_ALIASES[tool] ?? tool
	const resolvedIncludedTools = includedTools?.map((t) => TOOL_ALIASES[t] ?? t)

	// Check tool requirements first
	if (toolRequirements && typeof toolRequirements === "object") {
		if (
			(tool in toolRequirements && !toolRequirements[tool]) ||
			(resolvedTool in toolRequirements && !toolRequirements[resolvedTool])
		) {
			return false
		}
	} else if (toolRequirements === false) {
		return false
	}

	// Always allow these tools
	if (ALWAYS_AVAILABLE_TOOLS.includes(tool as any)) {
		return true
	}

	// Allow custom tools
	if (experiments?.customTools && customToolRegistry.has(tool)) {
		return true
	}

	// Check dynamic MCP tools
	const isDynamicMcpTool = tool.startsWith("mcp_")

	if (experiments && Object.values(EXPERIMENT_IDS).includes(tool as ExperimentId)) {
		if (!experiments[tool]) {
			return false
		}
	}

	const mode = getModeBySlug(modeSlug, customModes)

	if (!mode) {
		return false
	}

	// Check if tool is in any of the mode's groups
	for (const group of mode.groups) {
		const groupName = getGroupName(group)
		const options = getGroupOptions(group)

		const groupConfig = TOOL_GROUPS[groupName]

		// Check dynamic MCP tools
		if (isDynamicMcpTool && groupName === "mcp") {
			return true
		}

		// Check regular tools
		const isRegularTool = groupConfig.tools.includes(resolvedTool)

		// Check custom tools
		const isCustomTool =
			groupConfig.customTools?.includes(resolvedTool) && resolvedIncludedTools?.includes(resolvedTool)

		if (!isRegularTool && !isCustomTool) {
			continue
		}

		// Apply group options
		if (!options) {
			return true
		}

		// File regex validation for edit group
		if (groupName === "edit" && options.fileRegex) {
			const filePath = toolParams?.path || toolParams?.file_path
			const isEditOperation = EDIT_OPERATION_PARAMS.some((param) => toolParams?.[param])

			// Single file validation
			if (filePath && isEditOperation && !doesFileMatchRegex(filePath, options.fileRegex)) {
				throw new FileRestrictionError(mode.name, options.fileRegex, options.description, filePath, tool)
			}

			// Apply_patch validation
			if (tool === "apply_patch" && typeof toolParams?.patch === "string") {
				const patchFilePaths = extractFilePathsFromPatch(toolParams.patch)
				for (const patchFilePath of patchFilePaths) {
					if (!doesFileMatchRegex(patchFilePath, options.fileRegex)) {
						throw new FileRestrictionError(
							mode.name,
							options.fileRegex,
							options.description,
							patchFilePath,
							tool,
						)
					}
				}
			}
		}

		return true
	}

	return false
}
