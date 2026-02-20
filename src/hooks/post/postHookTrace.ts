// src/hooks/postHookTrace.ts
import fs from "fs"
import path from "path"
import crypto from "crypto"

export function logAgentTrace(filePath: string, intentId: string) {
	const content = fs.readFileSync(filePath, "utf-8")
	const hash = crypto.createHash("sha256").update(content).digest("hex")

	const traceEntry = {
		id: crypto.randomUUID(),
		timestamp: new Date().toISOString(),
		vcs: { revision_id: "<git_sha_here>" },
		files: [
			{
				relative_path: path.relative(process.cwd(), filePath),
				conversations: [],
				ranges: [{ start_line: 0, end_line: content.split("\n").length, content_hash: `sha256:${hash}` }],
				related: [{ type: "specification", value: intentId }],
			},
		],
	}

	const traceFile = path.join(process.cwd(), ".orchestration", "agent_trace.jsonl")
	fs.appendFileSync(traceFile, JSON.stringify(traceEntry) + "\n")
}
