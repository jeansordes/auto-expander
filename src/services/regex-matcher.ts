import createDebug from 'debug';
import pluginInfos from '../../manifest.json';
import type { TriggerContext } from './trigger-context';

const _log = createDebug(`${pluginInfos.id}:regex-matcher`);

type CompiledTrigger = ReturnType<typeof import('../core').compileTrigger>;

type MatchIndices = Array<[number, number]> & {
	groups?: Record<string, [number, number] | undefined>;
};

export class RegexMatcher {
	/**
	 * Finds the regex match at the cursor position
	 */
	findMatchAtCursor(
		compiledTrigger: CompiledTrigger,
		text: string,
		cursorIndex: number
	): RegExpExecArray | null {
		const searchRegex = this.createSearchRegex(compiledTrigger.regex);
		// Insert cursor marker at cursor position
		const CURSOR_MARKER_CHAR = '\uE000';
		const textWithCursor = text.slice(0, cursorIndex) + CURSOR_MARKER_CHAR + text.slice(cursorIndex);

		const matches = this.collectMatches(searchRegex, textWithCursor);
		if (matches.length === 0) {
			return null;
		}

		// Find the match that contains the cursor marker
		const cursorMatch = matches.find((match) => match[0].includes(CURSOR_MARKER_CHAR));

		// If no match contains the cursor, return the first match as fallback
		return cursorMatch ?? matches[0] ?? null;
	}

	/**
	 * Locates the current match in the editor text using the expected match text
	 */
	locateCurrentMatch(
		compiledTrigger: CompiledTrigger,
		text: string,
		expectedMatchText: string,
		preferredMatch?: RegExpExecArray,
		cursorIndex?: number
	): RegExpExecArray | null {
		const searchRegex = this.createSearchRegex(compiledTrigger.regex);
		const CURSOR_MARKER_CHAR = '\uE000';

		// If we have a cursor index, insert the cursor marker for accurate matching
		let textToSearch = text;
		if (typeof cursorIndex === 'number') {
			textToSearch = text.slice(0, cursorIndex) + CURSOR_MARKER_CHAR + text.slice(cursorIndex);
		}

		const matches = this.collectMatches(searchRegex, textToSearch);

		if (typeof cursorIndex === 'number') {
			// Find match that contains cursor marker and matches expected text (with cursor marker removed)
			const cursorMatch = matches.find((match) =>
				match[0].includes(CURSOR_MARKER_CHAR) &&
				match[0].replace(CURSOR_MARKER_CHAR, '') === expectedMatchText
			);
			if (cursorMatch) {
				// Adjust indices to account for cursor marker removal
				const indices = this.getMatchIndices(cursorMatch);
				if (indices) {
					const adjustedIndices: MatchIndices = indices.map(([start, end]) => [start, end - 1]);
					Reflect.set(cursorMatch, 'indices', adjustedIndices);
				}
				return cursorMatch;
			}
		}

		if (preferredMatch) {
			const preferredIndex = preferredMatch.index;
			const exactMatch = matches.find(
				(match) => match.index === preferredIndex && match[0].replace(CURSOR_MARKER_CHAR, '') === expectedMatchText
			);
			if (exactMatch) {
				// Adjust indices if match contains cursor marker
				if (exactMatch[0].includes(CURSOR_MARKER_CHAR)) {
					const indices = this.getMatchIndices(exactMatch);
					if (indices) {
						const adjustedIndices: MatchIndices = indices.map(([start, end]) => [start, end - 1]);
						Reflect.set(exactMatch, 'indices', adjustedIndices);
					}
				}
				return exactMatch;
			}

			let closestMatch: RegExpExecArray | null = null;
			let smallestDistance = Number.POSITIVE_INFINITY;
			for (const candidate of matches) {
				const cleanMatch = candidate[0].replace(CURSOR_MARKER_CHAR, '');
				if (cleanMatch !== expectedMatchText) {
					continue;
				}
				const distance = Math.abs(candidate.index - preferredIndex);
				if (distance < smallestDistance) {
					smallestDistance = distance;
					closestMatch = candidate;
				}
			}

			if (closestMatch) {
				// Adjust indices if match contains cursor marker
				if (closestMatch[0].includes(CURSOR_MARKER_CHAR)) {
					const indices = this.getMatchIndices(closestMatch);
					if (indices) {
						const adjustedIndices: MatchIndices = indices.map(([start, end]) => [start, end - 1]);
						Reflect.set(closestMatch, 'indices', adjustedIndices);
					}
				}
				return closestMatch;
			}
		}

		const fallbackMatch = matches.find((match) => match[0].replace(CURSOR_MARKER_CHAR, '') === expectedMatchText);
		if (fallbackMatch && fallbackMatch[0].includes(CURSOR_MARKER_CHAR)) {
			// Adjust indices if match contains cursor marker
			const indices = this.getMatchIndices(fallbackMatch);
			if (indices) {
				const adjustedIndices: MatchIndices = indices.map(([start, end]) => [start, end - 1]);
				Reflect.set(fallbackMatch, 'indices', adjustedIndices);
			}
		}
		return fallbackMatch ?? null;
	}

	/**
	 * Resolves the appropriate text and cursor index for matching based on trigger action
	 */
	resolveMatchingContext(context: TriggerContext, triggerAction: string): { textForMatching: string; cursorIndex: number } {
		const textForMatching = triggerAction === 'instant' ? context.afterText : context.beforeText;
		return { textForMatching, cursorIndex: context.cursorCharIndex };
	}

	/**
	 * Creates a global regex for searching all matches in text
	 */
	private createSearchRegex(regex: RegExp): RegExp {
		const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
		return new RegExp(regex.source, flags);
	}

	/**
	 * Collects all regex matches in the given text
	 */
	private collectMatches(regex: RegExp, text: string): RegExpExecArray[] {
		const matches: RegExpExecArray[] = [];
		let result = regex.exec(text);
		while (result) {
			matches.push(result);
			if (result.index === regex.lastIndex) {
				regex.lastIndex += 1;
			}
			result = regex.exec(text);
		}
		return matches;
	}

	/**
	 * Checks if the match contains the cursor position anywhere within its range
	 */
	private matchContainsCursor(match: RegExpExecArray, cursorIndex: number): boolean {
		const matchStart = match.index;
		const matchEnd = match.index + match[0].length;
		return cursorIndex >= matchStart && cursorIndex <= matchEnd;
	}

	private matchContainsCursorInclusive(match: RegExpExecArray, cursorIndex: number): boolean {
		const indices = this.getMatchIndices(match);
		if (indices && indices.length > 0) {
			const [start, end] = indices[0];
			return cursorIndex >= start && cursorIndex <= end;
		}
		return this.matchContainsCursor(match, cursorIndex);
	}

	/**
	 * Extracts match indices from RegExpExecArray
	 */
	private getMatchIndices(match: RegExpExecArray): MatchIndices | null {
		const indicesCandidate = Reflect.get(match, 'indices');
		if (!this.isMatchIndices(indicesCandidate)) {
			return null;
		}
		return indicesCandidate;
	}

	/**
	 * Type guard for match indices
	 */
	private isMatchIndices(value: unknown): value is MatchIndices {
		if (!Array.isArray(value)) {
			return false;
		}
		const groups = Reflect.get(value, 'groups');
		if (groups === undefined) {
			return true;
		}
		if (typeof groups !== 'object' || groups === null) {
			return false;
		}
		const groupValues = Object.values(groups);
		for (const entry of groupValues) {
			if (entry === undefined) {
				continue;
			}
			if (!Array.isArray(entry) || entry.length < 2) {
				return false;
			}
			const [start, end] = entry;
			if (typeof start !== 'number' || typeof end !== 'number') {
				return false;
			}
		}
		return true;
	}
}
