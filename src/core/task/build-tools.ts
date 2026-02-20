import path from "path"
import type OpenAI from "openai"

// @ts-ignore - Bypass broken types package to allow the extension to build
import type { ProviderSettings, ModeConfig, ModelInfo } from "@roo-code/types"
import { customToolRegistry, formatNative } from "@roo-code/core"

import type { ClineProvider } from "../webview/ClineProvider"
import { getRooDirectoriesForCwd } from "../../services/roo-config/index.js"

import { getNativeTools, getMcpServerTools } from "../prompts/tools/native-tools"
import {
	filterNativeToolsForMode,
	filterMcpToolsForMode,
	resolveToolAlias,
} from "../prompts/tools/filter-tools-for-mode"

// --- GOVERNANCE REUSE ---
// Importing your existing tool definition from the orchestration folder
// @ts-ignore
import { selectActiveIntentTool } from "../../orchestration/intentSelectionTool"

interface BuildToolsOptions {
	provider: ClineProvider
	cwd: string
	mode: string | undefined
	customModes: ModeConfig[] | undefined
	experiments: Record<string, boolean> | undefined
	apiConfiguration: ProviderSettings | undefined
	disabledTools?: string[]
	modelInfo?: ModelInfo
	includeAllToolsWithRestrictions?: boolean
}

interface BuildToolsResult {
	tools: OpenAI.Chat.ChatCompletionTool[]
	allowedFunctionNames?: string[]
}

function getToolName(tool: OpenAI.Chat.ChatCompletionTool): string {
	return (tool as OpenAI.Chat.ChatCompletionFunctionTool).function.name
}

export async function buildNativeToolsArray(options: BuildToolsOptions): Promise<OpenAI.Chat.ChatCompletionTool[]> {
	const result = await buildNativeToolsArrayWithRestrictions(options)
	return result.tools
}

export async function buildNativeToolsArrayWithRestrictions(options: BuildToolsOptions): Promise<BuildToolsResult> {
	const {
		provider,
		cwd,
		mode,
		customModes,
		experiments,
		apiConfiguration,
		disabledTools,
		modelInfo,
		includeAllToolsWithRestrictions,
	} = options

	const mcpHub = provider.getMcpHub()

	const { CodeIndexManager } = await import("../../services/code-index/manager")
	const codeIndexManager = CodeIndexManager.getInstance(provider.context, cwd)

	const filterSettings = {
		todoListEnabled: apiConfiguration?.todoListEnabled ?? true,
		disabledTools,
		modelInfo,
	}

	const supportsImages = modelInfo?.supportsImages ?? false
	const nativeTools = getNativeTools({ supportsImages })

	const filteredNativeTools = filterNativeToolsForMode(
		nativeTools,
		mode,
		customModes,
		experiments,
		codeIndexManager,
		filterSettings,
		mcpHub,
	)

	const mcpTools = getMcpServerTools(mcpHub)
	const filteredMcpTools = filterMcpToolsForMode(mcpTools, mode, customModes, experiments)

	let nativeCustomTools: OpenAI.Chat.ChatCompletionFunctionTool[] = []
	if (experiments?.customTools) {
		const toolDirs = getRooDirectoriesForCwd(cwd).map((dir) => path.join(dir, "tools"))
		await customToolRegistry.loadFromDirectoriesIfStale(toolDirs)
		const customTools = customToolRegistry.getAllSerialized()
		if (customTools.length > 0) {
			nativeCustomTools = customTools.map(formatNative)
		}
	}

	// --- GOVERNANCE INJECTION ---
	// Using the tool imported from your orchestration folder
	const filteredTools = [...filteredNativeTools, ...filteredMcpTools, ...nativeCustomTools, selectActiveIntentTool]

	if (includeAllToolsWithRestrictions) {
		const allTools = [...nativeTools, ...mcpTools, ...nativeCustomTools, selectActiveIntentTool]
		const allowedFunctionNames = filteredTools.map((tool) => resolveToolAlias(getToolName(tool)))

		return {
			tools: allTools,
			allowedFunctionNames,
		}
	}

	return {
		tools: filteredTools,
	}
}
