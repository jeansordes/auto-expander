import { App, Editor, MarkdownView } from 'obsidian';
import createDebug from 'debug';
import pluginInfos from '../../manifest.json';
import type { ParsedSnippet } from '../types';
import { matchesTrigger, compileTrigger } from '../core';
import { getCursorCharIndex } from '../utils/editor-position';
import { getGraphemeBeforeIndex, isSingleGrapheme } from '../utils/grapheme';
import { SnippetExecutor } from './snippet-executor';
import type { TriggerContext } from './trigger-context';
import { collectRelevantSnippets, shouldEvaluateInstantTrigger, logTriggerContext } from './snippet-trigger-helpers';
import { createInstantInputHandlers } from './instant-input-handler';
import { extractInsertedText, normalizeTriggerKey, isUnreliableInstantKey } from './trigger-normalization';

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

const INSTANT_INPUT_SUPPRESSION_MS = 64;
type CompiledTrigger = ReturnType<typeof compileTrigger>;

export type { TriggerContext } from './trigger-context';

export interface DebugEventPayload {
	source: 'keydown' | 'beforeinput' | 'input' | 'ios-keydown';
	eventKey?: string;
	normalizedKey?: string;
	insertedText?: string;
	inputType?: string;
	data?: string | null;
	metadata?: Record<string, unknown>;
}

export class ExpansionService {
	private readonly app: App;
	private readonly snippetExecutor: SnippetExecutor;
	private lastKeyboardInstantTimestamp: number | null = null;
	private debugNotifier?: (payload: DebugEventPayload) => void;

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
		shouldPreventKey?: (key: string, text: string, cursorIndex: number) => boolean,
		debugNotifier?: (payload: DebugEventPayload) => void
	): () => void {
		this.debugNotifier = debugNotifier;
		const keyboardHandler = this.createKeyboardHandler(
			snippetsValid,
			lastValidationError,
			onTriggerKeyPressed,
			shouldPreventKey
		);
		const inputHandlers = createInstantInputHandlers({
			app: this.app,
			snippetsValid,
			lastValidationError,
			isInteractionAllowed: this.isInteractionAllowed.bind(this),
			isSnippetExecuting: () => this.snippetExecutor.isExecuting(),
			onContext: onTriggerKeyPressed,
			extractInsertedText: (afterText: string, beforeIndex: number, afterIndex: number) =>
				extractInsertedText(afterText, beforeIndex, afterIndex),
			shouldSuppressInstantInput: () => this.shouldSuppressInstantInput(),
			debugNotifier: (payload) => this.notifyDebug(payload)
		});

		document.addEventListener('keydown', keyboardHandler, true);
		document.addEventListener('beforeinput', inputHandlers.beforeInput, true);
		document.addEventListener('input', inputHandlers.input, true);
		if (inputHandlers.keydown) {
			document.addEventListener('keydown', inputHandlers.keydown, true);
		}
		log('Expansion mechanism initialized');

		return () => {
			document.removeEventListener('keydown', keyboardHandler, true);
			document.removeEventListener('beforeinput', inputHandlers.beforeInput, true);
			document.removeEventListener('input', inputHandlers.input, true);
			if (inputHandlers.keydown) {
				document.removeEventListener('keydown', inputHandlers.keydown, true);
			}
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

			if (event.key.length !== 1 && !isUnreliableInstantKey(event.key)) {
				return;
			}

			const beforeText = editor.getValue();
			const beforeCursor = editor.getCursor();
			const beforeCharIndex = getCursorCharIndex(beforeText, beforeCursor);

			window.setTimeout(() => {
				const afterText = editor.getValue();
				const afterCursor = editor.getCursor();
				const cursorCharIndex = getCursorCharIndex(afterText, afterCursor);
				const insertedText = extractInsertedText(afterText, beforeCharIndex, cursorCharIndex);
				const fallbackFromCursor = getGraphemeBeforeIndex(afterText, cursorCharIndex);
                                const normalizedKey = normalizeTriggerKey(event.key, insertedText, fallbackFromCursor);
                                const anticipatedAction = this.getTriggerActionFromKey(normalizedKey);
                                const shouldDeferToInput = anticipatedAction === 'instant' && !insertedText && event.key.length === 1;

                                if (anticipatedAction === 'instant') {
                                        if (shouldDeferToInput) {
                                                this.lastKeyboardInstantTimestamp = null;
                                        } else {
                                                this.lastKeyboardInstantTimestamp = performance.now();
                                        }
                                } else if (anticipatedAction) {
                                        this.lastKeyboardInstantTimestamp = null;
                                }
                                if (normalizedKey !== event.key) {
                                        log(`Normalized key '${event.key}' to '${normalizedKey}' for instant trigger handling`);
                                }

                                this.notifyDebug({
                                        source: 'keydown',
                                        eventKey: event.key,
                                        normalizedKey,
                                        insertedText,
                                        metadata: {
                                                anticipatedAction,
                                                beforeCharIndex,
                                                cursorCharIndex,
                                                unreliable: isUnreliableInstantKey(event.key),
                                                deferredToInput: shouldDeferToInput
                                        }
                                });

                                if (shouldDeferToInput) {
                                        log(`Deferring instant trigger handling to input event for key '${event.key}' (no inserted text yet)`);
                                        return;
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

	getTriggerActionFromKey(key: string): string | null {
		switch (key) {
			case ' ': return 'space';
			case 'Tab': return 'tab';
			case 'Enter': return 'enter';
			case 'Backspace': return 'backspace';
			default:
				return isSingleGrapheme(key) ? 'instant' : null;
		}
	}

	private shouldSuppressInstantInput(): boolean {
		if (this.lastKeyboardInstantTimestamp === null) {
			return false;
		}

		const elapsed = performance.now() - this.lastKeyboardInstantTimestamp;
		this.lastKeyboardInstantTimestamp = null;
		return elapsed < INSTANT_INPUT_SUPPRESSION_MS;
	}

	private notifyDebug(payload: DebugEventPayload): void {
		this.debugNotifier?.(payload);
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
