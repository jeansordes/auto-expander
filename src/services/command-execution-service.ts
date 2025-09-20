import { App, Editor, MarkdownView, Notice } from 'obsidian';
import createDebug from 'debug';
import pluginInfos from '../../manifest.json';
import type { ParsedSnippet } from '../types';

const log = createDebug(`${pluginInfos.id}:command-execution`);
const MIN_INITIAL_COMMAND_DELAY = 50;

interface CommandManager {
	findCommand: (id: string) => { id: string; name: string } | undefined;
	executeCommandById: (id: string) => void;
}

export class CommandExecutionService {
	private readonly app: App;
	private commandDelay = 100;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Updates the delay between command executions
	 */
	updateCommandDelay(delay: number): void {
		this.commandDelay = Math.max(0, delay);
	}

	/**
	 * Executes commands for a snippet after text replacement is complete
	 */
	async executeCommands(
		editor: Editor,
		snippet: ParsedSnippet,
		originalMatch: RegExpExecArray
	): Promise<void> {
		if (snippet.commands.length === 0) {
			return;
		}

		log('Text replacement is complete, executing commands...');

		await this.ensureEditorContentPersisted(editor);
		this.verifyReplacement(editor, snippet, originalMatch);
		await this.runCommandSequence(snippet.commands);
	}

	/**
	 * Verifies that the replacement text was inserted correctly
	 */
	private verifyReplacement(editor: Editor, snippet: ParsedSnippet, originalMatch: RegExpExecArray): void {
		if (snippet.replacement.length === 0) {
			return;
		}

		let expectedText = this.removeCursorMarkers(snippet.replacement.join('\n'));
		expectedText = this.substituteCaptureGroups(expectedText, originalMatch);

		const textAfterDelay = editor.getValue();
		log(`Verifying replacement: editor text contains "${expectedText}": ${textAfterDelay.includes(expectedText)}`);

		// Re-focus cursor to ensure editor is ready for commands
		const cursor = editor.getCursor();
		editor.setCursor(cursor);
	}

	/**
	 * Executes a sequence of commands with proper error handling and delays
	 */
	private async runCommandSequence(commands: readonly string[]): Promise<void> {
		const commandManager = this.getCommandManager();
		if (!commandManager) {
			log('Warning: Command manager not available');
			return;
		}

		for (let i = 0; i < commands.length; i++) {
			const commandId = commands[i] ?? '';
			if (i === 0) {
				const initialDelay = Math.max(this.commandDelay, MIN_INITIAL_COMMAND_DELAY);
				await this.wait(initialDelay);
			}

			try {
				log(`Executing command: ${commandId}`);
				const command = commandManager.findCommand(commandId);
				if (!command) {
					log(`Warning: Command not found: ${commandId}`);
					new Notice(`Warning: Command "${commandId}" not found`, 3000);
					if (i < commands.length - 1) {
						await this.wait(this.commandDelay);
					}
					continue;
				}

				commandManager.executeCommandById(commandId);
				log(`Command executed successfully: ${commandId}`);
			} catch (error) {
				const message = this.getErrorMessage(error);
				log(`Warning: Failed to execute command ${commandId}:`, message);
				new Notice(`Warning: Failed to execute command "${commandId}"`, 3000);
			}

			if (i < commands.length - 1) {
				await this.wait(this.commandDelay);
			}
		}
	}

	private async ensureEditorContentPersisted(editor: Editor): Promise<void> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || activeView.editor !== editor) {
			return;
		}

		try {
			await activeView.save();
			log('Active note saved prior to executing commands');
		} catch (error) {
			const message = this.getErrorMessage(error);
			log('Warning: Failed to save active note before executing commands:', message);
		}
	}

	/**
	 * Removes cursor markers from text for verification purposes
	 */
	private removeCursorMarkers(text: string): string {
		return text.replace(/\$\{?0(?::[^}]*)?\}?/g, '');
	}

	/**
	 * Substitutes capture groups in text (simplified version for verification)
	 */
	private substituteCaptureGroups(text: string, match: RegExpExecArray): string {
		return text.replace(/\$(\d+)/g, (matchStr, groupIndex) => {
			const index = parseInt(groupIndex, 10);
			return match[index] || matchStr;
		});
	}

	/**
	 * Gets the command manager from the app
	 */
	private getCommandManager(): CommandManager | null {
		const candidate = Reflect.get(this.app, 'commands');
		if (!this.isCommandManager(candidate)) {
			return null;
		}
		return candidate;
	}

	/**
	 * Type guard for command manager
	 */
	private isCommandManager(value: unknown): value is CommandManager {
		if (typeof value !== 'object' || value === null) {
			return false;
		}
		const findCommand = Reflect.get(value, 'findCommand');
		const executeCommandById = Reflect.get(value, 'executeCommandById');
		return typeof findCommand === 'function' && typeof executeCommandById === 'function';
	}

	/**
	 * Utility method to wait for a specified duration
	 */
	private wait(duration: number): Promise<void> {
		return new Promise((resolve) => {
			window.setTimeout(resolve, duration);
		});
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
