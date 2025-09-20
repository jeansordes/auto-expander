import createDebug from 'debug';
import pluginInfos from '../../manifest.json';

const log = createDebug(`${pluginInfos.id}:grapheme-utils`);

type GraphemeSegment = { segment: string };
type GraphemeSegmenter = {
	segment: (input: string) => IterableIterator<GraphemeSegment>;
};

type SegmenterConstructor = new (
	locales?: string | string[],
	options?: { granularity?: 'grapheme' | 'word' | 'sentence' }
) => GraphemeSegmenter;

function isSegmenterConstructor(value: unknown): value is SegmenterConstructor {
	return typeof value === 'function';
}

let cachedSegmenter: GraphemeSegmenter | null | undefined;

function getSegmenter(): GraphemeSegmenter | null {
	if (cachedSegmenter !== undefined) {
		return cachedSegmenter;
	}

	try {
		const segmenterCtor = Reflect.get(Intl, 'Segmenter');
		if (isSegmenterConstructor(segmenterCtor)) {
			cachedSegmenter = new segmenterCtor(undefined, { granularity: 'grapheme' });
			return cachedSegmenter;
		}
	} catch (error) {
		log('Failed to initialize Segmenter:', error);
	}

	cachedSegmenter = null;
	return cachedSegmenter;
}

function normalizeNfc(value: string): string {
	try {
		return value.normalize('NFC');
	} catch {
		return value;
	}
}

export function getLastNormalizedGrapheme(text: string): string | null {
	if (!text) {
		return null;
	}

	const normalized = normalizeNfc(text);
	const segmenter = getSegmenter();
	if (!segmenter) {
		const chars = Array.from(normalized);
		return chars.length > 0 ? chars[chars.length - 1] ?? null : null;
	}

	let lastSegment: string | null = null;
	for (const { segment } of segmenter.segment(normalized)) {
		lastSegment = segment;
	}
	return lastSegment;
}

export function getGraphemeBeforeIndex(text: string, cursorIndex: number): string | null {
	if (!text || cursorIndex <= 0) {
		return null;
	}

	const preceding = text.slice(0, cursorIndex);
	return getLastNormalizedGrapheme(preceding);
}

export function isSingleGrapheme(text: string): boolean {
	if (!text) {
		return false;
	}

	const normalized = normalizeNfc(text);
	const segmenter = getSegmenter();
	if (!segmenter) {
		return Array.from(normalized).length === 1;
	}

	let count = 0;
	for (const _ of segmenter.segment(normalized)) {
		count++;
		if (count > 1) {
			return false;
		}
	}

	return count === 1;
}
