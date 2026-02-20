import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';

export class PreHookIntent {
    private currentIntent: string | null = null;
    
 async beforeTool(toolName: string, params: any, cline: any): Promise<{ allowed: boolean; error?: string }> {
    // Always allow the intent tool itself
    if (toolName === 'select_active_intent') {
        return { allowed: true };
    }
    
    // Always allow clear intent
    if (toolName === 'clear_active_intent') {
        return { allowed: true };
    }
    
    // Safe tools (read-only)
    const safeTools = ['read_file', 'list_files', 'search_files'];
    if (safeTools.includes(toolName)) {
        return { allowed: true };
    }
    
    // 🚨 PHASE 1 GATE: HARD BLOCK - NO SUGGESTIONS
    if (!this.currentIntent && !(cline as any).activeIntentId) {
        return {
            allowed: false,
            error: 'ERROR: Cannot create file - No active intent selected. Operation blocked.'
        };
    }
    
    return { allowed: true };
}
 async handleSelectIntent(intentId: string): Promise<{ success: boolean; context?: string; error?: string }> {
    try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return { 
                success: false, 
                error: '❌ FATAL: No workspace root. Cannot load governance files.' 
            };
        }
        
        const yamlPath = path.join(workspaceRoot, '.orchestration', 'active_intents.yaml');
        
        // 🔥 Check if file exists FIRST with specific error
        try {
            await fs.access(yamlPath);
        } catch {
            return { 
                success: false, 
                error: `❌ FATAL: Governance file not found at ${yamlPath}. This file is REQUIRED for intent selection. Please create it manually.` 
            };
        }
        
        const content = await fs.readFile(yamlPath, 'utf-8');
        const data = parseYaml(content);
        
        const intent = data.active_intents?.find((i: any) => i.id === intentId);
        if (!intent) {
            const availableIntents = data.active_intents?.map((i: any) => i.id).join(', ') || 'none';
            return { 
                success: false, 
                error: `❌ FATAL: Intent "${intentId}" not found. Available intents: ${availableIntents}` 
            };
        }
        
        this.currentIntent = intentId;
        
        // Build context for injection
        const context = `
<intent_context>
    <id>${intent.id}</id>
    <name>${intent.name}</name>
    <scope>${intent.owned_scope.join(', ')}</scope>
    ${intent.constraints ? `<constraints>${intent.constraints.join(', ')}</constraints>` : ''}
</intent_context>`;
        
        return { success: true, context };
        
    } catch (error) {
        return { 
            success: false, 
            error: `❌ FATAL: Governance system error: ${error}. Please check your .orchestration/ directory.` 
        };
    }
}
    
    clearIntent() {
        this.currentIntent = null;
    }
}