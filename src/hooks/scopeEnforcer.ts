
import type { Task } from "../core/task/Task" // Add this at the top with other imports


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
async function resolveProjectRoot(startPath: string): Promise<string> {
    console.log(`[GOVERNANCE DEBUG] resolveProjectRoot starting at: "${startPath}"`);
    let current = startPath;
    while (current !== path.dirname(current)) {
        const orchestrationPath = path.join(current, ".orchestration");
        console.log(`[GOVERNANCE DEBUG] Checking: "${orchestrationPath}"`);
        try {
            await fs.stat(orchestrationPath);
            console.log(`[GOVERNANCE DEBUG] ✅ FOUND .orchestration at: "${current}"`);
            return current;
        } catch (error) {
            console.log(`[GOVERNANCE DEBUG] ❌ Not found at: "${current}"`);
            current = path.dirname(current);
        }
    }
    console.log(`[GOVERNANCE DEBUG] ⚠️ No .orchestration found, returning: "${startPath}"`);
    return startPath; 
}

export async function loadIntentScope(workspaceRoot: string, intentId: string): Promise<IntentScope | undefined> {
    let filePath = "";
    
    try {
        console.log(`[GOVERNANCE DEBUG] loadIntentScope called with workspaceRoot: "${workspaceRoot}", intentId: "${intentId}"`);
        
        const projectRoot = await resolveProjectRoot(workspaceRoot);
        filePath = path.join(projectRoot, ".orchestration", "active_intents.yaml");
        
        console.log(`[GOVERNANCE DEBUG] Attempting to read: "${filePath}"`);
        
        const fileContents = await fs.readFile(filePath, "utf8");
        console.log(`[GOVERNANCE DEBUG] ✅ File read successfully, length: ${fileContents.length} chars`);
        
        const data = yaml.load(fileContents) as any;
        console.log(`[GOVERNANCE DEBUG] YAML parsed, top-level keys:`, Object.keys(data));

        const intentsList = data.active_intents || []; 
        console.log(`[GOVERNANCE DEBUG] Found ${intentsList.length} intents in YAML`);
        
        const intent = intentsList.find((i: any) => i.id === intentId);

        if (intent) {
            console.log(`[GOVERNANCE DEBUG] ✅ Found intent: ${intent.id}`);
            console.log(`[GOVERNANCE DEBUG]    owned_scope:`, intent.owned_scope);
            return {
                intent_id: intent.id,
                owned_scope: intent.owned_scope || [],
            };
        } else {
            console.warn(`[GOVERNANCE DEBUG] ❌ Intent ID "${intentId}" not found in YAML. Available intents:`, intentsList.map((i: any) => i.id));
        }
    } catch (error: any) {
        if (error.code === "ENOENT") {
            console.error(`[GOVERNANCE DEBUG] ❌ File not found at: "${filePath}"`);
            console.error(`[GOVERNANCE DEBUG]    Current working directory: ${process.cwd()}`);
        } else {
            console.error("[GOVERNANCE DEBUG] ❌ Error loading intent registry:", error);
        }
    }
    return undefined;
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

    if (actionType === "DESTRUCTIVE" && !activeIntent) {
        return {
            allowed: false,
            reason: `BLOCK: Destructive tool "${toolName}" requires an active intent.`
        }
    }

    if (actionType === "SAFE") return { allowed: true }

    // ✅ IMPROVED: Check ALL file-modifying tools
    const fileBasedTools = [
        "write_to_file",
        "apply_diff",
        "edit",
        "search_and_replace",
        "search_replace",
        "edit_file",
        "apply_patch"
    ];
    
    if (fileBasedTools.includes(toolName)) {
        const targetFile = params.path || params.file_path || params.toPath;
        if (!targetFile) return { allowed: true }

        const isWhitelisted = activeIntent?.owned_scope.some((pattern) => {
            const normalizedTarget = targetFile.replace(/\\/g, "/")
            const normalizedPattern = pattern.replace(/\\/g, "/")
            
            // Use minimatch for better pattern matching
            try {
                const { minimatch } = require('minimatch');
                return minimatch(normalizedTarget, normalizedPattern, { dot: true });
            } catch {
                // Fallback to simple matching
                return (
                    normalizedTarget.includes(normalizedPattern) ||
                    new RegExp(normalizedPattern.replace(/\*/g, ".*")).test(normalizedTarget)
                )
            }
        })

        if (!isWhitelisted) {
            return {
                allowed: false,
                reason: `SCOPE VIOLATION: Intent "${activeIntent?.intent_id}" cannot modify "${targetFile}". Allowed scope: ${activeIntent?.owned_scope.join(', ')}`
            }
        }
    }

    // ✅ ADDED: Check execute_command
    if (toolName === "execute_command") {
        const command = params.command || "";
        
        // Check if command tries to operate outside allowed scope
        // This is a simple check - you might want to enhance it
        const pathMatches = command.match(/\/([a-zA-Z0-9_\-/]+)/g);
        if (pathMatches) {
            for (const matchedPath of pathMatches) {
                const isWhitelisted = activeIntent?.owned_scope.some(pattern => 
                    matchedPath.includes(pattern.replace(/\*/g, ""))
                );
                
                if (!isWhitelisted) {
                    return {
                        allowed: false,
                        reason: `SCOPE VIOLATION: Command "${command}" references path outside intent scope.`
                    };
                }
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



/**
 * Unified Governance Guard - Called by all tools
 * Checks both intent selection AND scope permissions
 */
// export async function runGovernanceGuard(
//     toolName: string, 
//     params: any, 
//     cline: Task
// ): Promise<{ allowed: boolean; error?: string }> {
//     // ✅ FIXED: Use the getter directly
//     // const activeIntentId = cline.getActiveIntentId();    
    
//     const actionType = classifyAction(toolName, params);
// 	  const activeIntentId = cline.getActiveIntentId();    
//     console.log(`[GOVERNANCE DEBUG] runGovernanceGuard for ${toolName}, activeIntentId: ${activeIntentId}`);
    
//     const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
//     console.log(`[GOVERNANCE DEBUG] VS Code workspace root: "${workspaceRoot}"`);
    
//     if (actionType === "DESTRUCTIVE") {
//         if (!activeIntentId) {
//             return {
//                 allowed: false,
//                 error: `ERROR: Cannot modify files or execute commands - No active intent selected.`
//             };
//         }
        
//         const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
//         if (!workspaceRoot) {
//             return {
//                 allowed: false,
//                 error: "ERROR: Cannot determine workspace root for scope enforcement."
//             };
//         }
        
//         const intentScope = await loadIntentScope(workspaceRoot, activeIntentId);
        
//         // 🚨 ADD THIS CHECK - If intent not found in YAML, block the operation
//         if (!intentScope) {
//             return {
//                 allowed: false,
//                 error: `ERROR: Intent "${activeIntentId}" not found in .orchestration/active_intents.yaml. Please check the file.`
//             };
//         }
        
//         const scopeCheck = await enforceScope(toolName, params, intentScope);
        
//         if (!scopeCheck.allowed) {
//             return {
//                 allowed: false,
//                 error: scopeCheck.reason || `ERROR: Scope violation - Intent "${activeIntentId}" cannot perform this action.`
//             };
//         }
//     }
    
//     return { allowed: true };
// }

export async function runGovernanceGuard(
    toolName: string, 
    params: any, 
    cline: Task
): Promise<{ allowed: boolean; error?: string }> {
    const activeIntentId = cline.getActiveIntentId();    
    console.log(`[GOVERNANCE DEBUG] runGovernanceGuard for ${toolName}, activeIntentId: ${activeIntentId}`);
    
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    console.log(`[GOVERNANCE DEBUG] VS Code workspace root: "${workspaceRoot}"`);
    
    if (!workspaceRoot) {
        return {
            allowed: false,
            error: "ERROR: Cannot determine workspace root. Please open a folder/workspace first."
        };
    }
    
    // 👇 NEW: CONSTITUTIONAL GATE - Check protected paths FIRST
    const targetFile = params.path || params.file_path || params.toPath || '';
    if (targetFile) {
        const normalizedPath = targetFile.replace(/\\/g, "/");
        
        // Define protected patterns from .intentignore
        const protectedPatterns = [
            ".orchestration/**",
            ".env",
            ".git/**",
            "node_modules/**",
            "dist/**",
            "out/**"
        ];
        
        // Check if path matches any protected pattern
        const isProtected = protectedPatterns.some(pattern => {
            const patternRegex = pattern
                .replace(/\./g, '\\.')
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*');
            const regex = new RegExp(`^${patternRegex}$`);
            return regex.test(normalizedPath) || normalizedPath.includes(pattern.replace('**', ''));
        });
        
        if (isProtected) {
            return {
                allowed: false,
                error: `🔒 CONSTITUTIONAL BLOCK: The path "${targetFile}" is a protected system resource and cannot be modified.`
            };
        }
    }
    
    const actionType = classifyAction(toolName, params);
    
    if (actionType === "DESTRUCTIVE") {
        if (!activeIntentId) {
            return {
                allowed: false,
                error: `ERROR: Cannot modify files or execute commands - No active intent selected.`
            };
        }
        
        const intentScope = await loadIntentScope(workspaceRoot, activeIntentId);
        
        if (!intentScope) {
            return {
                allowed: false,
                error: `ERROR: Intent "${activeIntentId}" not found in .orchestration/active_intents.yaml.`
            };
        }
        
        const scopeCheck = await enforceScope(toolName, params, intentScope);
        
        if (!scopeCheck.allowed) {
            return {
                allowed: false,
                error: scopeCheck.reason || `ERROR: Scope violation - Intent "${activeIntentId}" cannot perform this action.`
            };
        }
        
        // UI-Blocking Authorization
        const fileDescription = targetFile ? `\nTarget: ${targetFile}` : '';
        const message = `🔒 Intent "${activeIntentId}" wants to ${toolName}${fileDescription}\n\nDo you approve this operation?`;
        
        const approval = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Approve',
            'Reject'
        );
        
        if (approval !== 'Approve') {
            console.log(`[GOVERNANCE] User REJECTED ${toolName} operation`);
            return {
                allowed: false,
                error: `❌ Operation rejected by user.`
            };
        }
        
        console.log(`[GOVERNANCE] User APPROVED ${toolName} operation`);
    }
    
    return { allowed: true };
}