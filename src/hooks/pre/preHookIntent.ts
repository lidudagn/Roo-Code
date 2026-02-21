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

    // 👇 NEW HELPER: Load related traces from agent_trace.jsonl
    private async loadRelatedTraces(workspaceRoot: string, intentId: string): Promise<any[]> {
        try {
            const tracePath = path.join(workspaceRoot, '.orchestration', 'agent_trace.jsonl');
            console.log(`[PreHookIntent] 🔍 Looking for traces at: ${tracePath}`);
            
            const traces = [];
            
            // Check if trace file exists
            try {
                await fs.access(tracePath);
                console.log(`[PreHookIntent] ✅ Trace file exists`);
            } catch {
                console.log(`[PreHookIntent] ℹ️ No trace file yet (this is normal for first run)`);
                return []; // No traces yet
            }
            
            const content = await fs.readFile(tracePath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            
            console.log(`[PreHookIntent] 📊 Found ${lines.length} total trace entries`);
            
            for (const line of lines) {
                try {
                    const trace = JSON.parse(line);
                    // Check if this trace is related to the intent
                    const isRelated = trace.files?.some((file: any) => 
                        file.related?.some((r: any) => r.type === 'specification' && r.value === intentId)
                    );
                    
                    if (isRelated) {
                        traces.push(trace);
                    }
                } catch (e) {
                    console.error(`[PreHookIntent] ❌ Error parsing trace line:`, e);
                }
            }
            
            console.log(`[PreHookIntent] ✅ Found ${traces.length} related traces for intent ${intentId}`);
            return traces;
        } catch (error) {
            console.error(`[PreHookIntent] ❌ Error loading traces:`, error);
            return [];
        }
    }

    async handleSelectIntent(intentId: string): Promise<{ success: boolean; context?: string; error?: string }> {
        console.log(`[PreHookIntent] 🎯 handleSelectIntent called with: "${intentId}"`);
        
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            console.log(`[PreHookIntent] 📂 Workspace root: "${workspaceRoot}"`);
            
            if (!workspaceRoot) {
                return { 
                    success: false, 
                    error: '❌ FATAL: No workspace root. Cannot load governance files.' 
                };
            }
            
            // Remove '/src' from the path if present
            const projectRoot = workspaceRoot?.replace(/\/src$/, '');
            const yamlPath = path.join(projectRoot, '.orchestration', 'active_intents.yaml');
            
            console.log(`[PreHookIntent] 📄 Looking for YAML at: "${yamlPath}"`);
            
            // Check if file exists
            try {
                await fs.access(yamlPath);
                console.log(`[PreHookIntent] ✅ YAML file exists`);
            } catch {
                console.error(`[PreHookIntent] ❌ YAML file does NOT exist at: "${yamlPath}"`);
                return { 
                    success: false, 
                    error: `❌ FATAL: Governance file not found at ${yamlPath}.` 
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
            
            // 👇 NEW: Load related traces
            const relatedTraces = await this.loadRelatedTraces(projectRoot, intentId);
            
            // 👇 NEW: Build traces context if any exist
            let tracesContext = '';
            if (relatedTraces.length > 0) {
                tracesContext = '\n<related_agent_traces>\n';
                for (const trace of relatedTraces) {
                    tracesContext += `  <trace id="${trace.id}" timestamp="${trace.timestamp}">\n`;
                    tracesContext += `    <files>\n`;
                    
                    for (const file of trace.files || []) {
                        tracesContext += `      <file path="${file.relative_path}">\n`;
                        if (file.conversations?.[0]?.ranges?.[0]?.content_hash) {
                            tracesContext += `        <content_hash>${file.conversations[0].ranges[0].content_hash}</content_hash>\n`;
                        }
                        tracesContext += `      </file>\n`;
                    }
                    
                    tracesContext += `    </files>\n`;
                    tracesContext += `  </trace>\n`;
                }
                tracesContext += '</related_agent_traces>';
            }
            
            // 👇 UPDATED: Enhanced context with traces
            const context = `
<intent_context>
    <id>${intent.id}</id>
    <name>${intent.name}</name>
    <scope>${intent.owned_scope.join(', ')}</scope>
    ${intent.constraints ? `<constraints>${intent.constraints.join(', ')}</constraints>` : ''}
    ${intent.acceptance_criteria ? `<acceptance_criteria>${intent.acceptance_criteria.join(', ')}</acceptance_criteria>` : ''}
</intent_context>${tracesContext}`;
            
            console.log(`[PreHookIntent] ✅ Success! Intent "${intentId}" activated with ${relatedTraces.length} related traces`);
            return { success: true, context };
            
        } catch (error) {
            console.error(`[PreHookIntent] 💥 Error:`, error);
            return { 
                success: false, 
                error: `❌ FATAL: Governance system error: ${error}.` 
            };
        }
    }
    
    clearIntent() {
        this.currentIntent = null;
    }
}