import { compileTrigger } from '../../src/core';
import { RegexMatcher } from '../../src/services/regex-matcher';

describe('RegexMatcher locateCurrentMatch', () => {
	it('returns the occurrence containing the cursor when identical matches exist', () => {
		const matcher = new RegexMatcher();
		const trigger = '/${0:newline}(.)\\n((#+) .*[0-9]{4}-[0-9]{2}-[0-9]{2}.*)/';
		const compiled = compileTrigger(trigger);

		const text = [
			'## Comments',
			'### 2025-09-20 (Saturday 20 September 2025)',
			'## Comments',
			'### 2025-09-20 (Saturday 20 September 2025)'
		].join('\n');
		const cursorIndex = text.lastIndexOf('### 2025-09-20');

		const matchAtCursor = matcher.findMatchAtCursor(compiled, text, cursorIndex + 5);
		expect(matchAtCursor).not.toBeNull();
		if (!matchAtCursor) {
			throw new Error('Expected to find match at cursor');
		}

		const locatedMatch = matcher.locateCurrentMatch(
			compiled,
			text,
			matchAtCursor[0],
			matchAtCursor,
			cursorIndex + 5
		);

		expect(locatedMatch).not.toBeNull();
		expect(locatedMatch?.index).toBe(matchAtCursor.index);
	});
});
