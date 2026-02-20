// import minimatch from "minimatch"

// export function enforceScope(filePath: string, intentScope: string[]) {
// 	const matchesScope = intentScope.some((scopePattern) => minimatch(filePath, scopePattern))
// 	if (!matchesScope) {
// 		throw new Error(`Scope Violation: Current intent cannot modify ${filePath}`)
// 	}
// }
// src/hooks/scopeEnforcer.ts
import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import * as yaml from "js-yaml"

export interface IntentScope {
	intent_id: string
	owned_scope: string[]
}

/**
 * PHASE 2: The Security Boundary
 * Manages intent loading, command classification, and scope enforcement.
 */

/**
 * 1. YAML Loader: Fetches the formal intent definition from the registry.
 */
export async function loadIntentScope(workspaceRoot: string, intentId: string): Promise<IntentScope | undefined> {
	try {
		const filePath = path.join(workspaceRoot, ".orchestration", "active_intents.yaml")
		const fileContents = await fs.readFile(filePath, "utf8")
		const data = yaml.load(fileContents) as any

		const intent = data.intents.find((i: any) => i.id === intentId)

		if (intent) {
			return {
				intent_id: intent.id,
				owned_scope: intent.owned_scope || [],
			}
		}
	} catch (error) {
		console.error("[GOVERNANCE] Error loading intent registry:", error)
	}
	return undefined
}

/**
 * 2. Command Classifier: Separates Safe (Read) vs Destructive (Write/Execute) actions.
 */
export function classifyAction(toolName: string, params: any): "SAFE" | "DESTRUCTIVE" {
	const destructiveTools = [
		"write_to_file",
		"execute_command",
		"apply_diff",
		"delete_file",
		"apply_patch",
		"new_task",
	]

	if (!destructiveTools.includes(toolName)) return "SAFE"

	// Special case for execute_command: check if it's just a 'read' command
	if (toolName === "execute_command") {
		const command = (params.command || "").toLowerCase()
		const safePrefixes = ["ls", "cat", "grep", "pwd", "git status", "git diff", "find"]
		if (safePrefixes.some((pref) => command.startsWith(pref))) {
			return "SAFE"
		}
	}

	return "DESTRUCTIVE"
}

/**
 * 3. Scope Enforcer: Validates the target file against the owned_scope patterns.
 */
export async function enforceScope(
	toolName: string,
	params: any,
	activeIntent: IntentScope | undefined,
): Promise<{ allowed: boolean; reason?: string }> {
	const actionType = classifyAction(toolName, params)

	// Block destructive actions if no intent is active
	if (actionType === "DESTRUCTIVE" && !activeIntent) {
		return {
			allowed: false,
			reason: `BLOCK: Destructive tool "${toolName}" requires an active intent. Please call "select_active_intent" first.`,
		}
	}

	// Skip scope check for SAFE actions (reading is generally allowed)
	if (actionType === "SAFE") return { allowed: true }

	// File-based Scope Validation
	if (toolName === "write_to_file" || toolName === "apply_diff") {
		const targetFile = params.path || params.toPath
		if (!targetFile) return { allowed: true }

		const isWhitelisted = activeIntent?.owned_scope.some((pattern) => {
			// Support exact matches and simple suffix/directory matches
			const normalizedTarget = targetFile.replace(/\\/g, "/")
			const normalizedPattern = pattern.replace(/\\/g, "/")

			return (
				normalizedTarget.includes(normalizedPattern) ||
				new RegExp(normalizedPattern.replace(/\*/g, ".*")).test(normalizedTarget)
			)
		})

		if (!isWhitelisted) {
			return {
				allowed: false,
				reason: `SCOPE VIOLATION: Intent "${activeIntent?.intent_id}" is not authorized to modify "${targetFile}". If this is necessary, update the "owned_scope" in .orchestration/active_intents.yaml.`,
			}
		}
	}

	return { allowed: true }
}

/**
 * 4. UI-Blocking Authorization: Human-in-the-loop approval.
 */
export async function requestManualApproval(toolName: string, intentId: string, detail?: string): Promise<boolean> {
	const detailMsg = detail ? `\nTarget: ${detail}` : ""
	const message = `[GOVERNANCE] Intent "${intentId}" is requesting: ${toolName}${detailMsg}\n\nDo you authorize this action?`

	const action = await vscode.window.showWarningMessage(message, { modal: true }, "Approve", "Reject")

	return action === "Approve"
}
