import * as crypto from 'crypto';

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
        const { execSync } = require('child_process');
        return execSync('git rev-parse HEAD', { cwd: workspaceRoot }).toString().trim();
    } catch {
        return 'unknown';
    }
}

/**
 * Classify mutation type (simplified for now)
 * Later we can enhance with AST analysis
 */
export function classifyMutation(oldContent: string | null, newContent: string): 'AST_REFACTOR' | 'INTENT_EVOLUTION' {
    if (!oldContent) {
        return 'INTENT_EVOLUTION'; // New file is evolution
    }
    
    // Simple heuristic: if content length changed significantly, it's evolution
    // Later we'll use actual AST comparison
    const lengthDiff = Math.abs(newContent.length - oldContent.length);
    if (lengthDiff > 100) {
        return 'INTENT_EVOLUTION';
    }
    
    return 'AST_REFACTOR';
}