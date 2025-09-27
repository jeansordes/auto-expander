import { compileTrigger, matchesTrigger } from '../../src/core';

describe('matchesTrigger cursor evaluation', () => {
	it('requires the cursor to align with the cursor marker for literal triggers', () => {
		const compiled = compileTrigger('/today${0:newline,tab,space,instant}');
		const text = 'prefix /today suffix';
		const triggerStart = text.indexOf('/today');
		const cursorInside = triggerStart + 3; // Between "to" and "day"
		const cursorAtEnd = triggerStart + '/today'.length;

		expect(matchesTrigger(compiled, text, cursorInside, 'space')).toBe(false);
		expect(matchesTrigger(compiled, text, cursorAtEnd, 'space')).toBe(true);
	});

	it('keeps flexible cursor positioning for regex triggers with leading markers', () => {
		const compiled = compileTrigger('/${0:instant}(abc)/');
		const text = 'xxabcxx';
		const matchStart = text.indexOf('abc');
		const cursorInside = matchStart + 1; // Inside the matched text

		expect(matchesTrigger(compiled, text, cursorInside, 'instant')).toBe(true);
	});

	it('matches multiline regex triggers with caret anchor', () => {
		const compiled = compileTrigger('/^[ ]*- ${0:space}/');
		const text = '-\n- ';
		const cursorPos = text.length; // At the end of the second line

		expect(matchesTrigger(compiled, text, cursorPos, 'space')).toBe(true);
	});
});
