import * as fs from "fs/promises"
import * as yaml from "js-yaml"
import { WorkspacePaths } from "./workspacePaths"

export interface Intent {
	id: string
	name: string
	status: "IN_PROGRESS" | "COMPLETED" | "BLOCKED"
	owned_scope: string[]
	constraints: string[]
	acceptance_criteria: string[]
}

export class IntentRepository {
	async getIntent(workspaceRoot: string, intentId: string): Promise<Intent | undefined> {
		const filePath = WorkspacePaths.getIntentFile(workspaceRoot)

		try {
			const fileContents = await fs.readFile(filePath, "utf8")
			const data = yaml.load(fileContents) as { active_intents: Intent[] }

			if (!data || !data.active_intents) return undefined

			return data.active_intents.find((i) => i.id === intentId)
		} catch (error) {
			console.error("[IntentRepository] Error reading intents:", error)
			return undefined
		}
	}
}
