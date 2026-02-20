import * as vscode from 'vscode';
import * as path from 'path';
import { minimatch } from 'minimatch';

// Constitutional paths that are ALWAYS off-limits for writing/executing
const DEFAULT_IGNORE = [
    '.orchestration/**',
    '.env',
    '.git/**',
    'node_modules/**',
];

/**
 * Validates if a target path is protected by the immutable governance layer.
 * This check happens BEFORE scope enforcement.
 */
export async function isPathProtected(targetPath: string, workspaceRoot: string): Promise<{ protected: boolean; reason?: string }> {
    const relativePath = path.relative(workspaceRoot, path.resolve(workspaceRoot, targetPath));

    // 1. Check against hardcoded constitutional defaults
    const isDefaultIgnored = DEFAULT_IGNORE.some(pattern => minimatch(relativePath, pattern, { dot: true }));
    
    if (isDefaultIgnored) {
        return {
            protected: true,
            reason: `🔒 CONSTITUTIONAL BLOCK: The path "${relativePath}" is a protected system resource and cannot be modified.`
        };
    }

    return { protected: false };
}