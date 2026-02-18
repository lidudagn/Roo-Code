export const INTENT_TOOL_MAP: Record<string, string[]> = {
	PLAN: [],
	ANALYZE: ["read_file"],
	DEBUG: ["read_file"],
	CODE: ["write_file", "apply_diff"],
	WRITE_FILE: ["write_file"],
	READ_FILE: ["read_file"],
	EXECUTE: ["run_command"],
}

export function enforceToolCompatibility(currentIntent: string, toolName: string) {
	if (!INTENT_TOOL_MAP[currentIntent]?.includes(toolName)) {
		throw new Error(`Tool "${toolName}" not allowed under intent "${currentIntent}"`)
	}
}
