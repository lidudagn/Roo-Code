import minimatch from "minimatch"

export function enforceScope(filePath: string, intentScope: string[]) {
	const matchesScope = intentScope.some((scopePattern) => minimatch(filePath, scopePattern))
	if (!matchesScope) {
		throw new Error(`Scope Violation: Current intent cannot modify ${filePath}`)
	}
}
