/**
 * ContextInjector handles the logic of merging intent context into the prompt stream.
 */
export class ContextInjector {
	/**
	 * Decorates the system prompt with the active intent context.
	 * This ensures the LLM is always aware of its current boundaries.
	 */
	static inject(basePrompt: string, intentContext: string): string {
		return `
${basePrompt}

# GOVERNANCE PROTOCOL
You are operating within the following strictly defined Intent Boundary. 
All your tool calls must align with these constraints and stay within the specified scope.

${intentContext}
`
	}
}
