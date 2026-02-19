import { IntentRepository } from "../storage/intentRepository.js"
/**
 * IntentLoader bridges the gap between the YAML storage and the LLM's prompt.
 * It transforms raw data into structured context blocks.
 */
export class IntentLoader {
	private repo: IntentRepository

	constructor() {
		this.repo = new IntentRepository()
	}

	/**
	 * Retrieves an intent and formats it for context injection.
	 * Uses XML-style tags to help the LLM recognize operational boundaries.
	 */
	async getFormattedContext(workspaceRoot: string, intentId: string): Promise<string> {
		const intent = await this.repo.getIntent(workspaceRoot, intentId)

		if (!intent) {
			return `[GOVERNANCE ERROR]: Intent ID "${intentId}" not found in .orchestration/active_intents.yaml. Check the ID and try again.`
		}

		return `
<active_intent_context>
    <id>${intent.id}</id>
    <name>${intent.name}</name>
    <status>${intent.status}</status>
    <constraints>
        ${intent.constraints.map((c) => `- ${c}`).join("\n        ")}
    </constraints>
    <owned_scope>
        ${intent.owned_scope.map((s) => `- ${s}`).join("\n        ")}
    </owned_scope>
    <acceptance_criteria>
        ${intent.acceptance_criteria.map((a) => `- ${a}`).join("\n        ")}
    </acceptance_criteria>
</active_intent_context>
`
	}
}
