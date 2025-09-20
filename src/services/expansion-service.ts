import { App, Editor, MarkdownView } from 'obsidian';
import createDebug from 'debug';
import pluginInfos from '../../manifest.json';
import type { ParsedSnippet } from '../types';
import { matchesTrigger, compileTrigger } from '../core';
import { getCursorCharIndex } from '../utils/editor-position';
import { SnippetExecutor } from './snippet-executor';
import type { TriggerContext } from './trigger-context';
import { collectRelevantSnippets, shouldEvaluateInstantTrigger, logTriggerContext } from './snippet-trigger-helpers';

const log = createDebug(`${pluginInfos.id}:expansion-service`);

const IGNORED_KEYS = new Set([
	'Shift',
	'Control',
	'Alt',
	'Meta',
	'CapsLock',
	'Escape',
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight'
]);

const PREVENTABLE_KEYS = new Set(['Tab', ' ', 'Enter', 'Backspace']);

type CompiledTrigger = ReturnType<typeof compileTrigger>;

export type { TriggerContext } from './trigger-context';

export class ExpansionService {
	private readonly app: App;
	private readonly snippetExecutor: SnippetExecutor;

	constructor(app: App) {
		this.app = app;
		this.snippetExecutor = new SnippetExecutor(app);
	}

	updateCommandDelay(delay: number): void {
		this.snippetExecutor.updateCommandDelay(delay);
	}

	setupExpansionMechanism(
		snippetsValid: boolean,
		lastValidationError: string | null,
		onTriggerKeyPressed: (context: TriggerContext) => void,
		shouldPreventKey?: (key: string, text: string, cursorIndex: number) => boolean
	): () => void {
		const keyboardHandler = this.createKeyboardHandler(
			snippetsValid,
			lastValidationError,
			onTriggerKeyPressed,
			shouldPreventKey
		);

		document.addEventListener('keydown', keyboardHandler, true);
		log('Expansion mechanism initialized');

		return () => {
			document.removeEventListener('keydown', keyboardHandler, true);
		};
	}

	private createKeyboardHandler(
		snippetsValid: boolean,
		lastValidationError: string | null,
		callback: (context: TriggerContext) => void,
		shouldPreventKey?: (key: string, text: string, cursorIndex: number) => boolean
	): (event: KeyboardEvent) => void {
		return (event: KeyboardEvent) => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!this.isInteractionAllowed(activeView, snippetsValid, lastValidationError)) {
				return;
			}

			const editor = activeView.editor;
			if (this.snippetExecutor.isExecuting()) {
				return;
			}
			if (editor.somethingSelected()) {
				return;
			}
			if (IGNORED_KEYS.has(event.key)) {
				return;
			}

			if (this.handlePreventableKey(event, editor, shouldPreventKey, callback)) {
				return;
			}

			if (event.key.length !== 1 && !this.isUnreliableInstantKey(event.key)) {
				return;
			}

			const beforeText = editor.getValue();
			const beforeCursor = editor.getCursor();
			const beforeCharIndex = getCursorCharIndex(beforeText, beforeCursor);

			window.setTimeout(() => {
				const afterText = editor.getValue();
				const afterCursor = editor.getCursor();
				const cursorCharIndex = getCursorCharIndex(afterText, afterCursor);
				const insertedText = this.extractInsertedText(afterText, beforeCharIndex, cursorCharIndex);
				const normalizedKey = this.normalizeTriggerKey(event.key, insertedText);
				if (normalizedKey !== event.key) {
					log(`Normalized key '${event.key}' to '${normalizedKey}' for instant trigger handling`);
				}

				const context: TriggerContext = {
					triggerKey: normalizedKey,
					originalKey: event.key,
					insertedText,
					beforeText,
					beforeCursor,
					afterText,
					afterCursor,
					cursorCharIndex,
					deletedChar: null
				};

				callback(context);
			}, 0);
		};
	}

	private isInteractionAllowed(
		view: MarkdownView | null,
		snippetsValid: boolean,
		lastValidationError: string | null
	): view is MarkdownView {
		if (!view?.editor) {
			return false;
		}

		const activeElement = document.activeElement;
		if (!activeElement || !view.containerEl.contains(activeElement)) {
			return false;
		}

		if (!snippetsValid) {
			if (lastValidationError) {
				log(`Expansion blocked due to validation error: ${lastValidationError}`);
			}
			return false;
		}

		return true;
	}

	private handlePreventableKey(
		event: KeyboardEvent,
		editor: Editor,
		shouldPreventKey: ((key: string, text: string, cursorIndex: number) => boolean) | undefined,
		callback: (context: TriggerContext) => void
	): boolean {
		if (!shouldPreventKey || !PREVENTABLE_KEYS.has(event.key)) {
			return false;
		}

		const currentText = editor.getValue();
		const currentCursor = editor.getCursor();
		const cursorIndex = getCursorCharIndex(currentText, currentCursor);

		if (!shouldPreventKey(event.key, currentText, cursorIndex)) {
			return false;
		}

		log(`Preventing default behavior for ${event.key} - would trigger snippet`);
		event.preventDefault();

		const deletedChar = event.key === 'Backspace' && cursorIndex > 0
			? currentText[cursorIndex - 1] ?? null
			: null;

		callback({
			triggerKey: event.key,
			originalKey: event.key,
			insertedText: '',
			beforeText: currentText,
			beforeCursor: currentCursor,
			afterText: currentText,
			afterCursor: currentCursor,
			cursorCharIndex: cursorIndex,
			deletedChar
		});

		return true;
	}

	private extractInsertedText(
		afterText: string,
		beforeIndex: number,
		afterIndex: number
	): string {
		if (afterIndex <= beforeIndex) {
			return '';
		}

		const insertionLength = afterIndex - beforeIndex;
		if (insertionLength <= 0) {
			return '';
		}

		const start = Math.max(0, afterIndex - insertionLength);
		return afterText.slice(start, afterIndex);
	}

	private normalizeTriggerKey(eventKey: string, insertedText: string): string {
		if (!this.isUnreliableInstantKey(eventKey)) {
			return eventKey;
		}

		if (!insertedText) {
			return eventKey;
		}

		if (insertedText.length === 1) {
			return insertedText;
		}

		return insertedText.slice(-1);
	}

	private isUnreliableInstantKey(key: string): boolean {
		return key === 'Unidentified' || key === 'Process' || key === 'Dead';
	}

	getTriggerActionFromKey(key: string): string | null {
		switch (key) {
			case ' ': return 'space';
			case 'Tab': return 'tab';
			case 'Enter': return 'enter';
			case 'Backspace': return 'backspace';
			default:
				return key.length === 1 ? 'instant' : null;
		}
	}

	checkForSnippetTrigger(
		context: TriggerContext,
		triggerAction: string,
		snippetMap: Map<string, ParsedSnippet[]>,
		getCompiledTrigger: (trigger: string, isRegex: boolean) => CompiledTrigger | undefined,
		onSnippetMatch: (editor: Editor, snippet: ParsedSnippet, compiledTrigger: CompiledTrigger, ctx: TriggerContext, action: string) => void
	): void {
		try {
			log(`Checking triggers: action=${triggerAction}, cursor=${context.afterCursor.ch} (charIndex=${context.cursorCharIndex}), key=${context.triggerKey}`);
			const snippets = collectRelevantSnippets(triggerAction, snippetMap);
			for (const snippet of snippets) {
				if (!snippet.isValid) {
					continue;
				}

				const compiledTrigger = getCompiledTrigger(snippet.trigger, snippet.regex);
				if (!compiledTrigger) {
					continue;
				}

				if (!shouldEvaluateInstantTrigger(snippet, context, triggerAction, log)) {
					continue;
				}

				const textToCheck = triggerAction === 'instant' ? context.afterText : context.beforeText;
				const cursorIndex = context.cursorCharIndex;

				logTriggerContext(log, snippet.trigger, textToCheck, cursorIndex);

				if (!matchesTrigger(compiledTrigger, textToCheck, cursorIndex, triggerAction)) {
					continue;
				}

				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!activeView?.editor) {
					return;
				}

				onSnippetMatch(activeView.editor, snippet, compiledTrigger, context, triggerAction);
				break;
			}
		} catch (error) {
			log('Error checking for snippet trigger:', error);
		}
	}

	async executeSnippet(
		editor: Editor,
		snippet: ParsedSnippet,
		compiledTrigger: CompiledTrigger,
		context: TriggerContext,
		triggerAction: string
	): Promise<void> {
		await this.snippetExecutor.executeSnippet(editor, snippet, compiledTrigger, context, triggerAction);
	}
}
