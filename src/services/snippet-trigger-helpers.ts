import type { ParsedSnippet } from '../types';
import type { TriggerContext } from './trigger-context';

export function collectRelevantSnippets(triggerAction: string, snippetMap: Map<string, ParsedSnippet[]>): ParsedSnippet[] {
	const actions = new Set<string>([triggerAction]);
	if (triggerAction === 'enter') {
		actions.add('newline');
	}
	if (triggerAction === 'newline') {
		actions.add('enter');
	}

	const snippets: ParsedSnippet[] = [];
	for (const action of actions) {
		const candidates = snippetMap.get(action) ?? [];
		for (const snippet of candidates) {
			if (!snippets.includes(snippet)) {
				snippets.push(snippet);
			}
		}
	}
	return snippets;
}

export function shouldEvaluateInstantTrigger(
	snippet: ParsedSnippet,
	context: TriggerContext,
	triggerAction: string,
	logger: (message: string) => void
): boolean {
	if (triggerAction !== 'instant') {
		return true;
	}

	const triggerWithoutMarker = snippet.trigger.replace(/\$\{[^}]+\}$/, '');
	const expectedChar = triggerWithoutMarker.charAt(triggerWithoutMarker.length - 1);
	if (!expectedChar) {
		return true;
	}

	let typedCharCandidate = context.triggerKey;

	// For iOS/mobile: if triggerKey is unreliable, try to get it from insertedText
	if (context.triggerKey === 'Unidentified' || context.triggerKey === 'Process' || context.triggerKey === 'Dead') {
		if (context.insertedText.length === 1) {
			typedCharCandidate = context.insertedText;
		} else if (context.insertedText.length > 1) {
			// Check if insertedText ends with expectedChar
			const lastInsertedChar = context.insertedText.slice(-1);
			const secondLastInsertedChar = context.insertedText.length >= 2 ? context.insertedText.slice(-2, -1) : '';

			// If the last character matches expected, or if it's a standard ASCII char, use it
			if (lastInsertedChar === expectedChar || (lastInsertedChar.charCodeAt(0) >= 32 && lastInsertedChar.charCodeAt(0) <= 126)) {
				typedCharCandidate = lastInsertedChar;
			} else if (context.insertedText.length <= 4) {
				// For short multi-character insertions (emojis, accented chars), check if it contains expectedChar
				typedCharCandidate = context.insertedText.includes(expectedChar) ? expectedChar : context.insertedText;
			} else {
				typedCharCandidate = lastInsertedChar;
			}
		}
	}

	// If we still don't have a valid candidate, fall back to insertedText logic
	if (!typedCharCandidate || typedCharCandidate === 'Unidentified') {
		typedCharCandidate = context.insertedText.length === 1
			? context.insertedText
			: context.insertedText.slice(-1);
	}

	if (!typedCharCandidate) {
		logger(`Unable to resolve typed character for ${snippet.trigger}; key='${context.triggerKey}', inserted='${context.insertedText}'`);
		return true;
	}

	const matchesLastChar = typedCharCandidate === expectedChar;
	if (!matchesLastChar) {
		logger(`Skipping instant trigger ${snippet.trigger}: typed '${typedCharCandidate}' but expected '${expectedChar}' (key='${context.triggerKey}', inserted='${context.insertedText}')`);
	}
	return matchesLastChar;
}

export function logTriggerContext(
	logger: (message: string) => void,
	trigger: string,
	text: string,
	cursorIndex: number
): void {
	const start = Math.max(0, cursorIndex - 20);
	const end = Math.min(text.length, cursorIndex + 20);
	const contextText = text.substring(start, end);
	const cursorInContext = cursorIndex - start;
	const beforeSnippet = text.substring(Math.max(0, cursorIndex - 10), cursorIndex);
	const afterSnippet = text.substring(cursorIndex, Math.min(text.length, cursorIndex + 10));

	logger(`Checking trigger "${trigger}" with text around cursor: "...${contextText}..." (cursor at position ${cursorInContext} in context, ${cursorIndex} in full text)`);
	logger(`Full text length: ${text.length}, cursor position: ${cursorIndex}`);
	logger(`Text at cursor: "${beforeSnippet}|${afterSnippet}"`);
}
