import * as crypto from 'crypto';
import { execSync } from 'child_process';

/**
 * Generate SHA-256 hash of content
 * This ensures spatial independence - if lines move, hash remains valid
 */
export function generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Get git revision ID if available
 */
export async function getGitRevision(workspaceRoot: string): Promise<string> {
    try {
        return execSync('git rev-parse HEAD', { cwd: workspaceRoot }).toString().trim();
    } catch (error) {
        console.log('[hashing] No git repository or unable to get revision');
        return 'unknown';
    }
}

/**
 * Classify mutation type (simplified for now)
 * Later we can enhance with AST analysis
 * 
 * INTENT_EVOLUTION: New feature, significant change
 * AST_REFACTOR: Same intent, just restructuring code
 */
export function classifyMutation(oldContent: string | null, newContent: string): 'AST_REFACTOR' | 'INTENT_EVOLUTION' {
    // If file didn't exist before, it's a new feature (evolution)
    if (!oldContent) {
        return 'INTENT_EVOLUTION';
    }
    
    // Simple heuristic: if content length changed significantly, it's evolution
    // (more than 20% change or more than 50 lines)
    const oldLines = oldContent.split('\n').length;
    const newLines = newContent.split('\n').length;
    const lineDiff = Math.abs(newLines - oldLines);
    
    const oldLength = oldContent.length;
    const newLength = newContent.length;
    const lengthDiffPercent = Math.abs(newLength - oldLength) / oldLength;
    
    // If line count changed by more than 10 or length changed by more than 20%, it's evolution
    if (lineDiff > 10 || lengthDiffPercent > 0.2) {
        return 'INTENT_EVOLUTION';
    }
    
    // Otherwise, it's a refactor (same intent, different implementation)
    return 'AST_REFACTOR';
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
    return crypto.randomUUID();
}

/**
 * Calculate line range for a file
 */
export function getLineRange(content: string): { start_line: number; end_line: number } {
    const lines = content.split('\n');
    return {
        start_line: 1,
        end_line: lines.length
    };
}

/**
 * Normalize file path for consistent storage
 * Converts absolute path to relative path with forward slashes
 */
export function normalizePath(filePath: string, workspaceRoot: string): string {
    // Convert to relative path
    let relative = filePath;
    if (filePath.startsWith(workspaceRoot)) {
        relative = filePath.substring(workspaceRoot.length);
    }
    
    // Remove leading slash and normalize separators
    return relative.replace(/^[\/\\]/, '').replace(/\\/g, '/');
}

/**
 * Extract file path from tool parameters (helper for trace logging)
 */
export function extractFilePathFromParams(toolName: string, params: any): string | undefined {
    if (!params) return undefined;
    
    // Check common parameter names for file paths
    if (params.path && typeof params.path === 'string') return params.path;
    if (params.file_path && typeof params.file_path === 'string') return params.file_path;
    if (params.destination && typeof params.destination === 'string') return params.destination;
    if (params.toPath && typeof params.toPath === 'string') return params.toPath;
    
    return undefined;
}

/**
 * Format trace entry for logging (returns a formatted string, not an object)
 */
export function formatTracePreview(trace: any): string {
    const id = trace.id ? trace.id.substring(0, 8) + '...' : 'unknown';
    const file = trace.files?.[0]?.relative_path || 'unknown';
    const intent = trace.files?.[0]?.conversations?.[0]?.related?.[0]?.value || 'unknown';
    const hash = trace.files?.[0]?.conversations?.[0]?.ranges?.[0]?.content_hash?.substring(0, 10) + '...' || 'unknown';
    const type = trace.mutation_type || 'unknown';
    
    return `Trace(id: ${id}, file: ${file}, intent: ${intent}, hash: ${hash}, type: ${type})`;
}