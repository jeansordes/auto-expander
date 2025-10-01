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

	it('requires exact cursor positioning for explicit regex triggers', () => {
		const compiled = compileTrigger('/${0:instant}(abc)/');
		const text = 'xxabcxx';
		const matchStart = text.indexOf('abc');
		const cursorInside = matchStart + 1; // Inside the matched text
		const cursorAtMarker = matchStart; // At the cursor marker position

		expect(matchesTrigger(compiled, text, cursorInside, 'instant')).toBe(false);
		expect(matchesTrigger(compiled, text, cursorAtMarker, 'instant')).toBe(true);
	});

	it('matches multiline regex triggers with caret anchor', () => {
		const compiled = compileTrigger('/^[ ]*- ${0:space}/');
		const text = '-\n- ';
		const cursorPos = text.length; // At the end of the second line

		expect(matchesTrigger(compiled, text, cursorPos, 'space')).toBe(true);
	});

	describe('user scenarios with current trigger (cursor marker at beginning)', () => {
		const trigger = "/${0:newline}(.)\n((#+) .*[0-9]{4}-[0-9]{2}-[0-9]{2}.*)/";
		const compiled = compileTrigger(trigger);

		it('scenario 1: header line only - should not trigger', () => {
			const text = '### 2025-09-29 (lundi 29 septembre 2025)';
			const cursorPos = text.length; // At end of header line

			expect(matchesTrigger(compiled, text, cursorPos, 'newline')).toBe(false);
		});

		it('scenario 2: anytext cursor before header - should not trigger (wrong trigger)', () => {
			const text = 'anytext\n### 2025-09-29 (lundi 29 septembre 2025)';
			const cursorPos = 'anytext'.length; // At end of "anytext", before the newline

			expect(matchesTrigger(compiled, text, cursorPos, 'newline')).toBe(false);
		});

		it('scenario 3: anytext header cursor at end - should not trigger', () => {
			const text = 'anytext\n### 2025-09-30 (lundi 29 septembre 2025)';
			const cursorPos = text.length; // At end of header line

			expect(matchesTrigger(compiled, text, cursorPos, 'newline')).toBe(false);
		});
	});

	describe('user scenarios with corrected trigger (cursor marker in correct position)', () => {
		const trigger = "/(.)${0:newline}\n((#+) .*[0-9]{4}-[0-9]{2}-[0-9]{2}.*)/";
		const compiled = compileTrigger(trigger);

		it('scenario 1: header line only - should not trigger', () => {
			const text = '### 2025-09-29 (lundi 29 septembre 2025)';
			const cursorPos = text.length; // At end of header line

			expect(matchesTrigger(compiled, text, cursorPos, 'newline')).toBe(false);
		});

		it('scenario 2: anytext cursor before header - should trigger', () => {
			const text = 'anytext\n### 2025-09-29 (lundi 29 septembre 2025)';
			const cursorPos = 'anytext'.length; // At end of "anytext", before the newline

			expect(matchesTrigger(compiled, text, cursorPos, 'enter')).toBe(true);
		});

		it('scenario 3: anytext header cursor at end - should not trigger', () => {
			const text = 'anytext\n### 2025-09-30 (lundi 29 septembre 2025)';
			const cursorPos = text.length; // At end of header line

			expect(matchesTrigger(compiled, text, cursorPos, 'newline')).toBe(false);
		});
	});

	describe('user new scenario with header cursor before header', () => {
		const trigger = "/(.+)${0:newline}\n((#+) .*[0-9]{4}-[0-9]{2}-[0-9]{2}.*)/";
		const compiled = compileTrigger(trigger);

		it('header cursor before second header - should trigger', () => {
			const text = '### 2025-10-01 (mercredi 1 octobre 2025)\n### 2025-09-30 (mardi 29 septembre 2025)';
			const cursorPos = '### 2025-10-01 (mercredi 1 octobre 2025)'.length; // At end of first header

			expect(matchesTrigger(compiled, text, cursorPos, 'enter')).toBe(true);
		});

		it('should not trigger when no second header exists', () => {
			const text = '### 2025-10-01 (mercredi 1 octobre 2025)';
			const cursorPos = text.length; // At end of single header

			expect(matchesTrigger(compiled, text, cursorPos, 'enter')).toBe(false);
		});
	});
});
