import { PreHookIntent } from "../pre/preHookIntent";
import { PreHookScope } from '../pre/PreHookScope';
// import { PostHookTrace } from '../post/PostHookTrace';

export class HookEngine {
    private preHooks: any[] = [];
    private postHooks: any[] = [];
    
    // Singleton instance
    private static instance: HookEngine;
    
    // Make constructor private for singleton
    private constructor() {
        // 🔥 IMPORTANT: Initialize and register hooks HERE
        this.initializeHooks();
    }
    
    static getInstance(): HookEngine {
        if (!HookEngine.instance) {
            HookEngine.instance = new HookEngine();
        }
        return HookEngine.instance;
    }
    
    // 🔥 NEW: Initialize all hooks
    private initializeHooks() {
        // Create hook instances
        const intentHook = new PreHookIntent();
        const scopeHook = new PreHookScope();
        // const traceHook = new PostHookTrace();
        
        // Register them
        this.registerPreHook(intentHook);
        this.registerPreHook(scopeHook);
        // this.registerPostHook(traceHook);
        
        console.log('[HookEngine] Registered pre-hooks:', this.preHooks.length);
    }
    
    // Register hooks
    registerPreHook(hook: any) {
        this.preHooks.push(hook);
    }
    
    registerPostHook(hook: any) {
        this.postHooks.push(hook);
    }
    
    // Execute pre-hooks (can block)
    async executePreHooks(toolName: string, params: any, cline: any): Promise<{ allowed: boolean; error?: string }> {
        console.log(`[HookEngine] Executing ${this.preHooks.length} pre-hooks for ${toolName}`);
        
        for (const hook of this.preHooks) {
            // Make sure hook has beforeTool method
            if (typeof hook.beforeTool !== 'function') {
                console.warn('[HookEngine] Hook missing beforeTool method:', hook);
                continue;
            }
            
            const result = await hook.beforeTool(toolName, params, cline);
            if (!result.allowed) {
                console.log(`[HookEngine] Hook blocked: ${result.error}`);
                return result;
            }
        }
        return { allowed: true };
    }
    
    // Execute post-hooks (never block)
    async executePostHooks(toolName: string, params: any, result: any, cline: any) {
        console.log(`[HookEngine] Executing ${this.postHooks.length} post-hooks for ${toolName}`);
        
        for (const hook of this.postHooks) {
            if (typeof hook.afterTool === 'function') {
                await hook.afterTool(toolName, params, result, cline);
            }
        }
    }
    
    // Helper to get specific hook if needed
    getIntentHook(): PreHookIntent | undefined {
        return this.preHooks.find(hook => hook instanceof PreHookIntent) as PreHookIntent;
    }
}