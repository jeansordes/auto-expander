import { App, Editor, MarkdownView } from 'obsidian';
import { getCursorCharIndex } from '../utils/editor-position';
import { getLastNormalizedGrapheme } from '../utils/grapheme';
import type { TriggerContext } from './trigger-context';
import type { DebugEventPayload } from './expansion-service';

const INSTANT_INPUT_TYPES = new Set([
	'insertText',
	'insertReplacementText',
	'insertCompositionText'
]);

// Detect iOS devices where beforeinput/input events are unreliable for character input
const isIOS = (): boolean => {
	return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
};

interface PendingInputState {
	beforeText: string;
	beforeCursor: ReturnType<Editor['getCursor']>;
	beforeCharIndex: number;
	data: string | null;
	inputType: string;
}

interface InstantInputHandlerOptions {
	app: App;
	snippetsValid: boolean;
	lastValidationError: string | null;
	isInteractionAllowed: (view: MarkdownView | null, snippetsValid: boolean, lastValidationError: string | null) => view is MarkdownView;
	isSnippetExecuting: () => boolean;
	onContext: (context: TriggerContext) => void;
	extractInsertedText: (afterText: string, beforeIndex: number, afterIndex: number) => string;
	shouldSuppressInstantInput: () => boolean;
	debugNotifier?: (payload: DebugEventPayload) => void;
}

export function createInstantInputHandlers(options: InstantInputHandlerOptions): {
	beforeInput: (event: InputEvent) => void;
	input: (event: InputEvent) => void;
	keydown?: (event: KeyboardEvent) => void;
} {
	let pendingInstantInput: PendingInputState | null = null;
	const debug = options.debugNotifier;

	const captureBeforeInput = (event: InputEvent) => {
		if (!INSTANT_INPUT_TYPES.has(event.inputType)) {
			return;
		}

		const activeView = options.app.workspace.getActiveViewOfType(MarkdownView);
		if (!options.isInteractionAllowed(activeView, options.snippetsValid, options.lastValidationError)) {
			return;
		}

		debug?.({
			source: 'beforeinput',
			inputType: event.inputType,
			data: event.data ?? null,
			metadata: {
				supportsInputType: INSTANT_INPUT_TYPES.has(event.inputType)
			}
		});

		const editor = activeView.editor;
		if (options.isSnippetExecuting()) {
			return;
		}
		if (editor.somethingSelected()) {
			return;
		}

		const beforeText = editor.getValue();
		const beforeCursor = editor.getCursor();
		const beforeCharIndex = getCursorCharIndex(beforeText, beforeCursor);

		pendingInstantInput = {
			beforeText,
			beforeCursor,
			beforeCharIndex,
			data: event.data ?? null,
			inputType: event.inputType
		};
	};

	const handleInput = (event: InputEvent) => {
		if (!INSTANT_INPUT_TYPES.has(event.inputType)) {
			pendingInstantInput = null;
			return;
		}

		const pending = pendingInstantInput;
		pendingInstantInput = null;
		if (!pending) {
			return;
		}

		const activeView = options.app.workspace.getActiveViewOfType(MarkdownView);
		if (!options.isInteractionAllowed(activeView, options.snippetsValid, options.lastValidationError)) {
			return;
		}

		const editor = activeView.editor;
		const afterText = editor.getValue();
		const afterCursor = editor.getCursor();
		const cursorCharIndex = getCursorCharIndex(afterText, afterCursor);
		const insertedText = options.extractInsertedText(afterText, pending.beforeCharIndex, cursorCharIndex) || pending.data || '';
		if (!insertedText || !/\S/.test(insertedText)) {
			return;
		}

		if (options.shouldSuppressInstantInput()) {
			return;
		}

		const triggerKey = getLastNormalizedGrapheme(insertedText) ?? insertedText;
		debug?.({
			source: 'input',
			inputType: event.inputType,
			insertedText,
			data: pending.data ?? null,
			normalizedKey: triggerKey,
			metadata: {
				cursorCharIndex,
				beforeCharIndex: pending.beforeCharIndex
			}
		});

		// On iOS, use the iOS-specific keydown handler instead of the input handler
		// to avoid race conditions with text insertion timing
		if (isIOS()) {
			return;
		}

		const context: TriggerContext = {
			triggerKey,
			originalKey: pending.data ?? triggerKey,
			insertedText,
			beforeText: pending.beforeText,
			beforeCursor: pending.beforeCursor,
			afterText,
			afterCursor,
			cursorCharIndex,
			deletedChar: null
		};

		options.onContext(context);
	};

	// iOS fallback: use keydown events when beforeinput/input events don't work reliably
	const handleKeydownForIOS = (event: KeyboardEvent) => {
		// Only handle printable characters, ignore modifier keys, navigation keys, etc.
		if (event.ctrlKey || event.metaKey || event.altKey ||
			event.key.length > 1 ||
			event.key === ' ' && event.shiftKey) { // Ignore shift+space which is handled elsewhere
			return;
		}

		const activeView = options.app.workspace.getActiveViewOfType(MarkdownView);
		if (!options.isInteractionAllowed(activeView, options.snippetsValid, options.lastValidationError)) {
			return;
		}

		const editor = activeView.editor;
		if (options.isSnippetExecuting()) {
			return;
		}
		if (editor.somethingSelected()) {
			return;
		}

		// Check if this is a composition event (IME input)
		if (event.isComposing) {
			return;
		}

		if (options.shouldSuppressInstantInput()) {
			return;
		}

		const beforeText = editor.getValue();
		const beforeCursor = editor.getCursor();
		const beforeCharIndex = getCursorCharIndex(beforeText, beforeCursor);

		debug?.({
			source: 'ios-keydown',
			eventKey: event.key,
			metadata: {
				cursorCharIndex: beforeCharIndex
			}
		});

		// Create a synthetic trigger context for the key that was pressed
		const triggerKey = event.key;

		// Use multiple setTimeout attempts to handle asynchronous text insertion on iOS
		const checkInsertedText = (attemptsLeft: number) => {
			const afterText = editor.getValue();
			const afterCursor = editor.getCursor();
			const cursorCharIndex = getCursorCharIndex(afterText, afterCursor);
			const inserted = options.extractInsertedText(afterText, beforeCharIndex, cursorCharIndex);

			// Check if the key was inserted (cursor moved by at least the key length)
			const cursorMoved = cursorCharIndex > beforeCharIndex;
			const textChanged = inserted.length > 0;

			if ((cursorMoved && textChanged) || attemptsLeft <= 0) {
				const context: TriggerContext = {
					triggerKey,
					originalKey: triggerKey,
					insertedText: inserted || triggerKey,
					beforeText,
					beforeCursor,
					afterText,
					afterCursor,
					cursorCharIndex,
					deletedChar: null
				};
				debug?.({
					source: 'ios-keydown',
					eventKey: triggerKey,
					normalizedKey: triggerKey,
					insertedText: inserted,
					metadata: {
						cursorCharIndex,
						attemptsLeft,
						cursorMoved,
						textChanged
					}
				});
				options.onContext(context);
				return;
			}

			// Try again with a longer delay
			setTimeout(() => checkInsertedText(attemptsLeft - 1), 10);
		};

		setTimeout(() => checkInsertedText(5), 0); // Try up to 5 times with 10ms delays
	};

	const handlers: {
		beforeInput: (event: InputEvent) => void;
		input: (event: InputEvent) => void;
		keydown?: (event: KeyboardEvent) => void;
	} = {
		beforeInput: captureBeforeInput,
		input: handleInput
	};

	// Add iOS-specific keydown handler as fallback
	if (isIOS()) {
		handlers.keydown = handleKeydownForIOS;
	}

	return handlers;
}
