import type OpenAI from "openai"

const recordLesson: OpenAI.Chat.ChatCompletionTool = {
    type: "function",
    function: {
        name: "record_lesson",
        description: "Record a lesson learned in CLAUDE.md for future agents to reference. Use this when you discover important patterns, gotchas, or solutions that other agents should know.",
        parameters: {
            type: "object",
            properties: {
                lesson: {
                    type: "string",
                    description: "The lesson content to record - be specific and actionable",
                },
                category: {
                    type: "string",
                    description: "Category for the lesson to help organize knowledge",
                    enum: ["Locking", "Scope", "Paths", "General", "API", "Testing", "Governance", "Debugging"],
                },
            },
            required: ["lesson"],
        },
    },
}

export default recordLesson