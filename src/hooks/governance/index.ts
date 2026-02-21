import * as vscode from 'vscode';
import { isPathProtected } from './immutableGuard';
import { enforceScope, loadIntentScope } from '../scopeEnforcer'; 

export async function checkGovernance(
    toolName: string, 
    params: any, 
    activeIntentId: string | null, 
    workspaceRoot: string
) {
    const targetPath = params.path || params.file_path || params.toPath || params.cwd;
    
    // 1. Constitutional Check (The "Immutable Guard")
    // This happens first to protect the .orchestration folder itself
    if (targetPath) {
        const protection = await isPathProtected(targetPath, workspaceRoot);
        if (protection.protected) {
            throw new Error(protection.reason);
        }
    }

    // 2. Load the Intent Scope from YAML
    let activeIntent = undefined;
    if (activeIntentId) {
        activeIntent = await loadIntentScope(workspaceRoot, activeIntentId);
    }

    // 3. Authorization Check (Phase 2: Scope Enforcer)
    // Your existing logic handles the Auth check inside (actionType === "DESTRUCTIVE" && !activeIntent)
    const scope = await enforceScope(toolName, params, activeIntent);
    
    if (!scope.allowed) {
        throw new Error(scope.reason);
    }

    return { allowed: true };
}