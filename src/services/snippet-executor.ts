import { App, Editor, Notice } from 'obsidian';
import createDebug from 'debug';
import pluginInfos from '../../manifest.json';
import type { ParsedSnippet } from '../types';
import type { TriggerContext } from './trigger-context';
import { compileTrigger } from '../core';
import { TextReplacementService } from './text-replacement-service';
import { CommandExecutionService } from './command-execution-service';
import { RegexMatcher } from './regex-matcher';

const log = createDebug(`${pluginInfos.id}:snippet-executor`);

type CompiledTrigger = ReturnType<typeof compileTrigger>;

export class SnippetExecutor {
	private readonly app: App;
	private readonly textReplacementService: TextReplacementService;
	private readonly commandExecutionService: CommandExecutionService;
	private readonly regexMatcher: RegexMatcher;
	private executing = false;

	constructor(app: App) {
		this.app = app;
		this.textReplacementService = new TextReplacementService();
		this.commandExecutionService = new CommandExecutionService(app);
		this.regexMatcher = new RegexMatcher();
	}

	isExecuting(): boolean {
		return this.executing;
	}

	updateCommandDelay(delay: number): void {
		this.commandExecutionService.updateCommandDelay(delay);
	}

	/**
	 * Executes a snippet by replacing text and running commands
	 */
	async executeSnippet(
		editor: Editor,
		snippet: ParsedSnippet,
		compiledTrigger: CompiledTrigger,
		context: TriggerContext,
		triggerAction: string
	): Promise<void> {
		if (this.executing) {
			return;
		}

		this.executing = true;

		try {
			log(`Executing snippet: ${snippet.id} - "${snippet.trigger}" -> "${JSON.stringify(snippet.replacement)}"`);

			const match = this.findSnippetMatch(compiledTrigger, context, triggerAction);
			if (!match) {
				log('No regex match found for replacement');
				return;
			}

			await this.performTextReplacement(editor, snippet, compiledTrigger, match, context, triggerAction);
			await this.performCommandExecution(editor, snippet, match);
			log(`Snippet executed successfully: ${snippet.id}`);
		} catch (error) {
			const message = this.getErrorMessage(error);
			log('Error executing snippet:', message);
			new Notice(`Error executing snippet: ${message}`);
		} finally {
			this.executing = false;
		}
	}

	/**
	 * Finds the appropriate regex match for the snippet
	 */
	private findSnippetMatch(
		compiledTrigger: CompiledTrigger,
		context: TriggerContext,
		triggerAction: string
	): RegExpExecArray | null {
		const { textForMatching, cursorIndex } = this.regexMatcher.resolveMatchingContext(context, triggerAction);

		const originalMatch = this.regexMatcher.findMatchAtCursor(compiledTrigger, textForMatching, cursorIndex);
		if (!originalMatch) {
			return null;
		}

		return originalMatch;
	}

	/**
	 * Performs the text replacement using the text replacement service
	 */
	private async performTextReplacement(
		editor: Editor,
		snippet: ParsedSnippet,
		compiledTrigger: CompiledTrigger,
		match: RegExpExecArray,
		context: TriggerContext,
		triggerAction: string
	): Promise<void> {
		const currentText = editor.getValue();
		const currentMatch = this.regexMatcher.locateCurrentMatch(
			compiledTrigger,
			currentText,
			match[0],
			match,
			context.cursorCharIndex
		);

		if (!currentMatch) {
			log(`No current match found with text "${match[0]}"`);
			return;
		}

		await this.textReplacementService.replaceText(editor, snippet, currentText, currentMatch, triggerAction);
	}

	/**
	 * Executes commands using the command execution service
	 */
	private async performCommandExecution(
		editor: Editor,
		snippet: ParsedSnippet,
		match: RegExpExecArray
	): Promise<void> {
		await this.commandExecutionService.executeCommands(editor, snippet, match);
	}

	/**
	 * Extracts error message from unknown error type
	 */
	private getErrorMessage(error: unknown): string {
		if (error instanceof Error && typeof error.message === 'string') {
			return error.message;
		}
		return 'Unknown error';
	}
}
