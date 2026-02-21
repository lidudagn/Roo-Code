
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ToolUse, AskApproval, HandleError, PushToolResult } from '../../../src/shared/tools.js';
import type { Task } from '../../../src/core/task/Task.js';




export const recordLessonTool = {
    name: 'record_lesson',
    description: 'Record a lesson learned in CLAUDE.md for future agents',
    
    async handle(
        cline: Task,
        toolUse: ToolUse<'record_lesson'>,
        callbacks: {
            askApproval: AskApproval;
            handleError: HandleError;
            pushToolResult: PushToolResult;
        }
    ): Promise<void> {
        const { askApproval, handleError, pushToolResult } = callbacks;
        
        try {
            // Use nativeArgs directly since it's properly typed
            const args = toolUse.nativeArgs;
            
            if (!args) {
                pushToolResult('Error: No arguments provided');
                return;
            }
            
            const lesson = args.lesson;
            const category = args.category || 'General';
            
            if (!lesson) {
                pushToolResult('Error: lesson content is required');
                return;
            }
            
            // Get workspace root
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                pushToolResult('Error: No workspace root');
                return;
            }
            
            const projectRoot = workspaceRoot.replace(/\/src$/, '');
            const claudePath = path.join(projectRoot, '.orchestration', 'CLAUDE.md');
            
            // Ensure directory exists
            await fs.mkdir(path.dirname(claudePath), { recursive: true });
            
            // Format lesson entry
            const date = new Date().toISOString().split('T')[0];
            const lessonEntry = `\n### ${date}: ${category}\n- ${lesson}\n`;
            
            // Append to CLAUDE.md
            await fs.appendFile(claudePath, lessonEntry, 'utf-8');
            
            console.log(`[LessonTool] ✅ Recorded lesson: ${lesson.substring(0, 50)}...`);
            pushToolResult(`✅ Lesson recorded in CLAUDE.md under "${category}"`);
            
        } catch (error) {
            await handleError('recording lesson', error as Error);
        }
    }
};