export class PreHookIntent {
	currentTurnIntent: string | null = null

	resetTurnIntent() {
		this.currentTurnIntent = null
	}

	checkIntentSelected(toolName: string) {
		if (!this.currentTurnIntent && toolName !== "select_active_intent") {
			throw new Error("Intent must be selected before executing tools.")
		}
	}

	handleSelectIntent(args: { intent: string; justification?: string }) {
		this.currentTurnIntent = args.intent
		return { status: "success", selectedIntent: args.intent }
	}
}
