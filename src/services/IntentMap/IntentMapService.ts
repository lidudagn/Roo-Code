import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

export interface IntentMapEntry {
    intentId: string;
    intentName: string;
    files: Set<string>;
}

export class IntentMapService {
    private static instance: IntentMapService;
    private map: Map<string, IntentMapEntry> = new Map();
    
    private constructor() {}
    
    static getInstance(): IntentMapService {
        if (!IntentMapService.instance) {
            IntentMapService.instance = new IntentMapService();
        }
        return IntentMapService.instance;
    }
    
  async addFileMapping(
    projectRoot: string,  // 👈 Rename parameter to make it clear it's already fixed
    intentId: string,
    intentName: string,
    filePath: string
): Promise<void> {
    try {
        const mapPath = path.join(projectRoot, '.orchestration', 'intent_map.md');
        
        // Read existing map or create new one
        let mapContent = '';
        try {
            mapContent = await fs.readFile(mapPath, 'utf-8');
        } catch {
            // File doesn't exist yet
        }
        
        // Normalize file path
        const normalizedPath = filePath.replace(/\\/g, '/');
        const relativePath = normalizedPath.includes(projectRoot) 
            ? normalizedPath.substring(projectRoot.length).replace(/^\//, '')
            : normalizedPath;
        
        // Check if this mapping already exists
        const mappingExists = mapContent.includes(`- ${relativePath}`) && 
                             mapContent.includes(`## ${intentId} (${intentName})`);
        
        if (!mappingExists) {
            // Update the map
            const updatedMap = this.updateMapContent(mapContent, intentId, intentName, relativePath);
            await fs.writeFile(mapPath, updatedMap, 'utf-8');
            console.log(`[IntentMap] ✅ Added mapping: ${intentId} -> ${relativePath}`);
        }
        
    } catch (error) {
        console.error('[IntentMap] ❌ Failed to update map:', error);
    }
}
    
    private updateMapContent(
        currentContent: string,
        intentId: string,
        intentName: string,
        filePath: string
    ): string {
        const intentHeader = `## ${intentId} (${intentName})`;
        const fileEntry = `- ${filePath}`;
        
        // If map is empty, create new one
        if (!currentContent.trim()) {
            return `# Intent-File Map\n\n${intentHeader}\n${fileEntry}\n`;
        }
        
        // Check if intent section exists
        const lines = currentContent.split('\n');
        let intentIndex = -1;
        let inIntentSection = false;
        let fileExists = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith(`## ${intentId} `)) {
                intentIndex = i;
                inIntentSection = true;
            } else if (inIntentSection && line.startsWith('## ')) {
                // Reached next intent section
                inIntentSection = false;
            } else if (inIntentSection && line.trim() === fileEntry) {
                fileExists = true;
            }
        }
        
        if (fileExists) {
            return currentContent; // No changes needed
        }
        
        if (intentIndex !== -1) {
            // Add to existing intent section
            let insertPosition = intentIndex + 1;
            while (insertPosition < lines.length && 
                   !lines[insertPosition].startsWith('## ')) {
                insertPosition++;
            }
            lines.splice(insertPosition, 0, fileEntry);
            return lines.join('\n');
        } else {
            // Add new intent section at the end
            if (currentContent.endsWith('\n')) {
                return currentContent + `${intentHeader}\n${fileEntry}\n`;
            } else {
                return currentContent + `\n${intentHeader}\n${fileEntry}\n`;
            }
        }
    }
    
 async getIntentFiles(workspaceRoot: string, intentId: string): Promise<string[]> {
    try {
        // Find project root by looking for .orchestration directory
        let projectRoot = workspaceRoot;
        while (projectRoot !== path.dirname(projectRoot)) {
            const testPath = path.join(projectRoot, '.orchestration');
            try {
                await fs.stat(testPath);
                break; // Found it!
            } catch {
                projectRoot = path.dirname(projectRoot);
            }
        }
        
        const mapPath = path.join(projectRoot, '.orchestration', 'intent_map.md');
        const content = await fs.readFile(mapPath, 'utf-8');
        const lines = content.split('\n');
        
        const files: string[] = [];
        let inIntent = false;
        
        for (const line of lines) {
            if (line.startsWith(`## ${intentId} `)) {
                inIntent = true;
            } else if (inIntent && line.startsWith('## ')) {
                inIntent = false;
            } else if (inIntent && line.startsWith('- ')) {
                files.push(line.substring(2).trim());
            }
        }
        
        return files;
    } catch (error) {
        console.error('[IntentMap] Error reading map:', error);
        return [];
    }
}
    
    async generateMapFromTraces(workspaceRoot: string): Promise<void> {
        try {
            const projectRoot = workspaceRoot.replace(/\/src$/, '');
            const tracePath = path.join(projectRoot, '.orchestration', 'agent_trace.jsonl');
            const mapPath = path.join(projectRoot, '.orchestration', 'intent_map.md');
            
            // Read traces
            let traces: any[] = [];
            try {
                const traceContent = await fs.readFile(tracePath, 'utf-8');
                traces = traceContent.split('\n')
                    .filter(l => l.trim())
                    .map(l => JSON.parse(l));
            } catch {
                // No traces yet
            }
            
            // Build map from traces
            const intentMap = new Map<string, Set<string>>();
            const intentNames = new Map<string, string>();
            
            for (const trace of traces) {
                for (const file of trace.files || []) {
                    for (const conv of file.conversations || []) {
                        for (const related of conv.related || []) {
                            if (related.type === 'specification') {
                                const intentId = related.value;
                                if (!intentMap.has(intentId)) {
                                    intentMap.set(intentId, new Set());
                                }
                                intentMap.get(intentId)!.add(file.relative_path);
                                
                                // Try to get intent name from active_intents.yaml
                                if (!intentNames.has(intentId)) {
                                    await this.loadIntentName(projectRoot, intentId, intentNames);
                                }
                            }
                        }
                    }
                }
            }
            
            // Generate map content
            let mapContent = '# Intent-File Map\n\n';
            
            for (const [intentId, files] of intentMap) {
                const intentName = intentNames.get(intentId) || intentId;
                mapContent += `## ${intentId} (${intentName})\n`;
                for (const file of Array.from(files).sort()) {
                    mapContent += `- ${file}\n`;
                }
                mapContent += '\n';
            }
            
            await fs.writeFile(mapPath, mapContent, 'utf-8');
            console.log('[IntentMap] ✅ Generated map from traces');
            
        } catch (error) {
            console.error('[IntentMap] ❌ Failed to generate map:', error);
        }
    }
    
    private async loadIntentName(
        projectRoot: string,
        intentId: string,
        intentNames: Map<string, string>
    ): Promise<void> {
        try {
            const yamlPath = path.join(projectRoot, '.orchestration', 'active_intents.yaml');
            const content = await fs.readFile(yamlPath, 'utf-8');
            const { load } = require('js-yaml');
            const data = load(content);
            
            const intent = data.active_intents?.find((i: any) => i.id === intentId);
            if (intent) {
                intentNames.set(intentId, intent.name);
            }
        } catch {
            // Ignore errors
        }
    }
}