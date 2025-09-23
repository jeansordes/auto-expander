import type { ParsedSnippet } from '../types';
import type { TriggerContext } from './trigger-context';
import { getGraphemeBeforeIndex, getLastNormalizedGrapheme } from '../utils/grapheme';

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
	const expectedChar = getLastNormalizedGrapheme(triggerWithoutMarker);
	if (!expectedChar) {
		return true;
	}

	const typedFromKey = context.triggerKey.length === 1 ? getLastNormalizedGrapheme(context.triggerKey) : null;
	const typedFromInserted = getLastNormalizedGrapheme(context.insertedText);
	const typedFromCursor = getGraphemeBeforeIndex(context.afterText, context.cursorCharIndex);
	const typedCharCandidate = typedFromKey ?? typedFromInserted ?? typedFromCursor;

	logger(`Evaluating instant trigger ${snippet.trigger}: expected='${expectedChar}', typedFromKey='${typedFromKey}', typedFromInserted='${typedFromInserted}', typedFromCursor='${typedFromCursor}', candidate='${typedCharCandidate}'`);

	if (!typedCharCandidate) {
		logger(
			`Unable to resolve typed character for ${snippet.trigger}; key='${context.triggerKey}', inserted='${context.insertedText}', cursorIndex=${context.cursorCharIndex}`
		);
		return true;
	}

	const matchesLastChar = typedCharCandidate === expectedChar;
	if (!matchesLastChar) {
		logger(
			`Skipping instant trigger ${snippet.trigger}: typed '${typedCharCandidate}' but expected '${expectedChar}' (key='${context.triggerKey}', inserted='${context.insertedText}', cursorIndex=${context.cursorCharIndex})`
		);
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
