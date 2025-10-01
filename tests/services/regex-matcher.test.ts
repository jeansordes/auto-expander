import { compileTrigger } from '../../src/core';
import { RegexMatcher } from '../../src/services/regex-matcher';

describe('RegexMatcher locateCurrentMatch', () => {
	it('returns the occurrence containing the cursor when identical matches exist', () => {
		const matcher = new RegexMatcher();
		const trigger = '/(.+)${0:newline}\\n((#+) .*[0-9]{4}-[0-9]{2}-[0-9]{2}.*)/';
		const compiled = compileTrigger(trigger);

		const text = [
			'## Comments',
			'### 2025-09-20 (Saturday 20 September 2025)',
			'## Comments',
			'### 2025-09-20 (Saturday 20 September 2025)'
		].join('\n');
		// Position cursor before the newline that precedes the second header
		const secondHeaderIndex = text.lastIndexOf('### 2025-09-20');
		const cursorIndex = secondHeaderIndex - 1; // Position before the newline before "### 2025-09-20"

		const matchAtCursor = matcher.findMatchAtCursor(compiled, text, cursorIndex);
		expect(matchAtCursor).not.toBeNull();
		if (!matchAtCursor) {
			throw new Error('Expected to find match at cursor');
		}

		const locatedMatch = matcher.locateCurrentMatch(
			compiled,
			text,
			matchAtCursor[0].replace('\uE000', ''), // Remove cursor marker for expected text
			matchAtCursor,
			cursorIndex
		);

		expect(locatedMatch).not.toBeNull();
		expect(locatedMatch?.index).toBe(matchAtCursor.index);
	});
});
