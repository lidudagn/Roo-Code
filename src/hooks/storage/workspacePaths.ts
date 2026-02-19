import * as path from "path"

export class WorkspacePaths {
	static getOrchestrationDir(workspaceRoot: string): string {
		return path.join(workspaceRoot, ".orchestration")
	}

	static getIntentFile(workspaceRoot: string): string {
		return path.join(this.getOrchestrationDir(workspaceRoot), "active_intents.yaml")
	}

	static getTraceFile(workspaceRoot: string): string {
		return path.join(this.getOrchestrationDir(workspaceRoot), "agent_trace.jsonl")
	}
}
