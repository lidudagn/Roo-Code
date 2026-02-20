import { ChatCompletionTool } from "openai/resources/index.mjs"

/**
 * PHASE 1: Tool Schema
 * This is what the LLM "reads" to understand how to use the Governance Handshake.
 */
export function createSelectActiveIntentTool(): ChatCompletionTool {
	return {
		type: "function",
		function: {
			name: "select_active_intent",
			description:
				"MUST be called before any destructive action. Registers the current task with the orchestration registry to obtain authorization for specific file scopes.",
			parameters: {
				type: "object",
				properties: {
					intent_id: {
						type: "string",
						description: "The unique ID from .orchestration/active_intents.yaml (e.g., 'GOV-TEST-001')",
					},
				},
				required: ["intent_id"],
			},
		},
	}
}
