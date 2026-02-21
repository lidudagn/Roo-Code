import * as crypto from 'crypto';
import * as fs from 'fs/promises';

export interface FileLock {
    path: string;
    hash: string;
    agentId: string;
    timestamp: string;
}

export class OptimisticLocking {
    private static locks: Map<string, FileLock> = new Map();
    
    static async readFileWithHash(filePath: string): Promise<{ content: string; hash: string }> {
        const content = await fs.readFile(filePath, 'utf-8');
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        return { content, hash };
    }
    
    static acquireLock(filePath: string, agentId: string, currentHash: string): boolean {
        const normalizedPath = filePath.replace(/\\/g, '/');
        
        if (this.locks.has(normalizedPath)) {
            const lock = this.locks.get(normalizedPath)!;
            console.log(`[Locking] ⚠️ File ${normalizedPath} locked by agent ${lock.agentId}`);
            return false;
        }
        
        this.locks.set(normalizedPath, {
            path: normalizedPath,
            hash: currentHash,
            agentId,
            timestamp: new Date().toISOString()
        });
        
        console.log(`[Locking] ✅ Agent ${agentId} acquired lock for ${normalizedPath}`);
        return true;
    }
    
    static async validateLock(filePath: string, agentId: string): Promise<{ valid: boolean; error?: string }> {
        const normalizedPath = filePath.replace(/\\/g, '/');
        const lock = this.locks.get(normalizedPath);
        
        if (!lock) {
            return { valid: false, error: 'No lock held' };
        }
        if (lock.agentId !== agentId) {
            return { valid: false, error: `Locked by agent ${lock.agentId}` };
        }
        
        try {
            const current = await fs.readFile(filePath, 'utf-8');
            const currentHash = crypto.createHash('sha256').update(current).digest('hex');
            
            if (currentHash !== lock.hash) {
                return { valid: false, error: 'File modified by another agent' };
            }
            return { valid: true };
        } catch {
            return { valid: false, error: 'Failed to read file' };
        }
    }
    
    static releaseLock(filePath: string, agentId: string): void {
        const normalizedPath = filePath.replace(/\\/g, '/');
        const lock = this.locks.get(normalizedPath);
        if (lock?.agentId === agentId) {
            this.locks.delete(normalizedPath);
            console.log(`[Locking] 🔓 Agent ${agentId} released ${normalizedPath}`);
        }
    }
    
    static updateLock(filePath: string, agentId: string, newHash: string): boolean {
        const normalizedPath = filePath.replace(/\\/g, '/');
        const lock = this.locks.get(normalizedPath);
        if (lock?.agentId === agentId) {
            lock.hash = newHash;
            lock.timestamp = new Date().toISOString();
            return true;
        }
        return false;
    }
}