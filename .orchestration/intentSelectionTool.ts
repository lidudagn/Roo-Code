import { ChatCompletionTool } from "openai/resources/index.mjs"

export const selectActiveIntentTool: ChatCompletionTool = {
	type: "function",
	function: {
		name: "select_active_intent",
		description:
			"MANDATORY: You must call this tool to 'checkout' an intent from active_intents.yaml before using any other tools.",
		parameters: {
			type: "object",
			properties: {
				intent_id: {
					type: "string",
					description: "The unique ID of the intent (e.g., INT-001)",
				},
				justification: {
					type: "string",
					description: "Brief explanation of why this intent is being activated for the current request.",
				},
			},
			required: ["intent_id"],
		},
	},
}
