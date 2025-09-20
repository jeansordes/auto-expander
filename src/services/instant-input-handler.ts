import { App, Editor, MarkdownView } from 'obsidian';
import { getCursorCharIndex } from '../utils/editor-position';
import { getLastNormalizedGrapheme } from '../utils/grapheme';
import type { TriggerContext } from './trigger-context';

const INSTANT_INPUT_TYPES = new Set([
	'insertText',
	'insertReplacementText',
	'insertCompositionText'
]);

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
}

function isEventWithinView(event: Event, view: MarkdownView | null): view is MarkdownView {
	if (!view) {
		return false;
	}

	const target = event.target;
	if (!target || !(target instanceof Node)) {
		return false;
	}

	return view.containerEl.contains(target);
}

export function createInstantInputHandlers(options: InstantInputHandlerOptions): {
	beforeInput: (event: InputEvent) => void;
	input: (event: InputEvent) => void;
} {
	let pendingInstantInput: PendingInputState | null = null;

	const captureBeforeInput = (event: InputEvent) => {
		if (!INSTANT_INPUT_TYPES.has(event.inputType)) {
			return;
		}

		const activeView = options.app.workspace.getActiveViewOfType(MarkdownView);
		if (!options.isInteractionAllowed(activeView, options.snippetsValid, options.lastValidationError)) {
			return;
		}
		if (!isEventWithinView(event, activeView)) {
			return;
		}

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
		if (!isEventWithinView(event, activeView)) {
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

	return {
		beforeInput: captureBeforeInput,
		input: handleInput
	};
}
