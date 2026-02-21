import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { generateContentHash, getGitRevision, classifyMutation, generateUUID, getLineRange, normalizePath } from '../../utils/hashing';

export interface TraceEntry {
    id: string;
    timestamp: string;
    vcs: {
        revision_id: string;
    };
    files: Array<{
        relative_path: string;
        conversations: Array<{
            url: string;
            contributor: {
                entity_type: 'AI' | 'Human';
                model_identifier?: string;
            };
            ranges: Array<{
                start_line: number;
                end_line: number;
                content_hash: string;
            }>;
            related: Array<{
                type: 'specification';
                value: string;
            }>;
        }>;
    }>;
    mutation_type?: 'AST_REFACTOR' | 'INTENT_EVOLUTION';
}

export class TraceService {
    private static instance: TraceService;
    
    private constructor() {}
    
    static getInstance(): TraceService {
        if (!TraceService.instance) {
            TraceService.instance = new TraceService();
        }
        return TraceService.instance;
    }
    
    async recordFileWrite(
        workspaceRoot: string,
        filePath: string,
        content: string,
        intentId: string,
        taskId: string,
        modelId: string,
        oldContent?: string | null
    ): Promise<void> {
        try {
const projectRoot = workspaceRoot.replace(/\/src$/, '');
const tracePath = path.join(projectRoot, '.orchestration', 'agent_trace.jsonl');
            
            // Ensure .orchestration directory exists
            await fs.mkdir(path.dirname(tracePath), { recursive: true });
            
            // Generate content hash
            const contentHash = generateContentHash(content);
            
            // Get git revision
            const revisionId = await getGitRevision(workspaceRoot);
            
            // Classify mutation type
            const mutationType = classifyMutation(oldContent || null, content);
            
            // Get line range
            const lineRange = getLineRange(content);
            
            // Get normalized relative path
            const relativePath = normalizePath(filePath, workspaceRoot);
            
            // Create trace entry
            const traceEntry: TraceEntry = {
                id: generateUUID(),
                timestamp: new Date().toISOString(),
                vcs: {
                    revision_id: revisionId
                },
                files: [{
                    relative_path: relativePath,
                    conversations: [{
                        url: taskId,
                        contributor: {
                            entity_type: 'AI',
                            model_identifier: modelId
                        },
                        ranges: [{
                            start_line: lineRange.start_line,
                            end_line: lineRange.end_line,
                            content_hash: `sha256:${contentHash}`
                        }],
                        related: [{
                            type: 'specification',
                            value: intentId
                        }]
                    }]
                }],
                mutation_type: mutationType
            };
            
            // Append to trace file
            await fs.appendFile(tracePath, JSON.stringify(traceEntry) + '\n');
            
            console.log(`[TraceService] ✅ Recorded trace for ${relativePath} (${mutationType})`);
            
        } catch (error) {
            console.error('[TraceService] ❌ Failed to record trace:', error);
        }
    }
    
 async getRelatedTraces(workspaceRoot: string, intentId: string): Promise<TraceEntry[]> {
    try {
        // ✅ FIX: Use the same projectRoot resolution
        const projectRoot = workspaceRoot.replace(/\/src$/, '');
        const tracePath = path.join(projectRoot, '.orchestration', 'agent_trace.jsonl');
        
        console.log(`[TraceService] Looking for traces at: ${tracePath}`);
        
        try {
            await fs.access(tracePath);
        } catch {
            return [];
        }
        
        const content = await fs.readFile(tracePath, 'utf-8');
        const traces: TraceEntry[] = [];
        
        for (const line of content.split('\n').filter(l => l.trim())) {
            try {
                const trace = JSON.parse(line) as TraceEntry;
                const isRelated = trace.files.some(file => 
                    file.conversations.some(conv => 
                        conv.related.some(r => r.type === 'specification' && r.value === intentId)
                    )
                );
                if (isRelated) {
                    traces.push(trace);
                }
            } catch (e) {
                console.error('[TraceService] Error parsing trace line:', e);
            }
        }
        
        console.log(`[TraceService] Found ${traces.length} related traces for intent ${intentId}`);
        return traces;
    } catch (error) {
        console.error('[TraceService] Error loading traces:', error);
        return [];
    }
}

async getAllTraces(workspaceRoot: string): Promise<TraceEntry[]> {
    try {
        // ✅ FIX: Use the same projectRoot resolution
        const projectRoot = workspaceRoot.replace(/\/src$/, '');
        const tracePath = path.join(projectRoot, '.orchestration', 'agent_trace.jsonl');
        
        console.log(`[TraceService] Getting all traces from: ${tracePath}`);
        
        try {
            await fs.access(tracePath);
        } catch {
            return [];
        }
        
        const content = await fs.readFile(tracePath, 'utf-8');
        const traces: TraceEntry[] = [];
        
        for (const line of content.split('\n').filter(l => l.trim())) {
            try {
                traces.push(JSON.parse(line));
            } catch (e) {
                console.error('[TraceService] Error parsing trace line:', e);
            }
        }
        
        return traces;
    } catch (error) {
        console.error('[TraceService] Error loading traces:', error);
        return [];
    }
}
}