import { getLastNormalizedGrapheme, isSingleGrapheme } from '../utils/grapheme';

const UNRELIABLE_KEYS = new Set(['Unidentified', 'Process', 'Dead']);

export function isUnreliableInstantKey(key: string): boolean {
	return UNRELIABLE_KEYS.has(key);
}

export function normalizeTriggerKey(
	eventKey: string,
	insertedText: string,
	fallbackFromCursor: string | null
): string {
	if (!isUnreliableInstantKey(eventKey)) {
		return normalizeSingleGrapheme(eventKey);
	}

	const insertedGrapheme = getLastNormalizedGrapheme(insertedText);
	if (insertedGrapheme) {
		return insertedGrapheme;
	}

	if (fallbackFromCursor) {
		return fallbackFromCursor;
	}

	return normalizeSingleGrapheme(eventKey);
}

export function normalizeSingleGrapheme(value: string): string {
	if (!value) {
		return value;
	}

	if (value.length === 1) {
		return getLastNormalizedGrapheme(value) ?? value;
	}

	if (isSingleGrapheme(value)) {
		return getLastNormalizedGrapheme(value) ?? value;
	}

	return value;
}

export function extractInsertedText(
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
