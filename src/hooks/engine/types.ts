export interface HookContext {
	intentId: string | null
	toolName: string
	args: any
	workspaceRoot: string
}

export interface HookResult {
	allowed: boolean
	reason?: string
	enhancedContext?: string
}

export type PreHook = (context: HookContext) => Promise<HookResult>
export type PostHook = (context: HookContext, result: any) => Promise<void>
