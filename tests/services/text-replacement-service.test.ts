import { Editor } from 'obsidian';
import { TextReplacementService } from '../../src/services/text-replacement-service';
import type { ParsedSnippet } from '../../src/types';

// Mock window for tests
(globalThis as unknown as { window: { setTimeout: jest.Mock } }).window = {
	setTimeout: jest.fn((cb) => cb()),
};

// Types for editor position
interface EditorPosition {
	line: number;
	ch: number;
}

// Mock Obsidian Editor that simulates text replacement
let currentText = '';
const mockEditor = {
	getValue: jest.fn(() => currentText),
	getRange: jest.fn((start: EditorPosition, end: EditorPosition) => {
		// Simple mock that returns substring based on line/ch positions
		// Assume single line for simplicity, or handle line 0 vs line 1
		let lineStart = 0;
		if (start.line === 1) {
			const newlineIndex = currentText.indexOf('\n');
			lineStart = newlineIndex >= 0 ? newlineIndex + 1 : 0;
		}
		return currentText.slice(lineStart + start.ch, lineStart + end.ch);
	}),
	replaceRange: jest.fn((text: string, start: EditorPosition, end: EditorPosition) => {
		// Simulate the replacement
		let lineStart = 0;
		if (start.line === 1) {
			const newlineIndex = currentText.indexOf('\n');
			lineStart = newlineIndex >= 0 ? newlineIndex + 1 : 0;
		}
		const startIdx = lineStart + start.ch;
		const endIdx = lineStart + end.ch;
		currentText = currentText.slice(0, startIdx) + text + currentText.slice(endIdx);
	}),
	setCursor: jest.fn(),
	getCursor: jest.fn(),
};

describe('TextReplacementService', () => {
	let service: TextReplacementService;

	beforeEach(() => {
		service = new TextReplacementService();
		// Mock the async waiting method to avoid infinite recursion in tests
		jest.spyOn(service as unknown as { waitForReplacementToComplete: jest.Mock }, 'waitForReplacementToComplete').mockResolvedValue(undefined);
		jest.clearAllMocks();
		currentText = 'foo\nbtw\nbar';
		mockEditor.getCursor.mockReturnValue({ line: 1, ch: 3 }); // After "btw"
	});

	describe('replaceText with cursor markers', () => {
		it('should preserve newline after cursor when replacement ends with cursor marker', async () => {

			// Create a snippet that matches the user's example
			const snippet: ParsedSnippet = {
				id: 'test',
				trigger: 'btw${0:instant}',
				replacement: ['By the way$0'],
				commands: [],
				cursorMarkerOptions: ['instant'],
				regex: false,
				isValid: true
			};

			// Create a mock regex match - this represents what the regex matcher found
			// The match should be "btw" at the position where cursor was inserted
			const match: RegExpExecArray & { indices: Array<[number, number]> } = {
				0: 'btw\uE000', // Match includes cursor marker
				index: 'foo\n'.length, // Start position of "btw"
				input: currentText,
				groups: undefined,
				indices: [['foo\n'.length, 'foo\nbtw'.length]] // Match range for "btw" in original text
			} as RegExpExecArray & { indices: Array<[number, number]> };

			// Execute the replacement
			await service.replaceText(mockEditor as unknown as Editor, snippet, currentText, match, 'instant');

			// The issue: replacement should preserve the newline and "bar"
			// Expected: replace "btw" with "By the way", keep "\nbar"
			// So replaceRange should be called with 'By the way' from start of "btw" to end of "btw"
			expect(mockEditor.replaceRange).toHaveBeenCalledWith('By the way', { line: 1, ch: 0 }, { line: 1, ch: 3 });

			// And cursor should be positioned after "By the way"
			expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 1, ch: 10 });

			// Check final text - should be "foo\nBy the way\nbar"
			expect(currentText).toBe('foo\nBy the way\nbar');
		});

		it('should handle the user-reported issue: btw trigger with newline preservation', async () => {
			// Reproduce the exact user scenario:
			// Initial text: foo\nbt|\nbar (cursor after "bt")
			// User types "w" -> foo\nbtw|\nbar
			// Trigger "btw${0:instant}" should match and replace "btw" with "By the way"
			// Result should be: foo\nBy the way|\nbar (not foo\nBy the way|bar)

			// Simulate the state after typing "w"
			currentText = 'foo\nbtw\nbar';
			mockEditor.getCursor.mockReturnValue({ line: 1, ch: 6 }); // After "btw"

			// Create a snippet matching the user's config
			const snippet: ParsedSnippet = {
				id: 'btw-test',
				trigger: 'btw${0:instant}',
				replacement: ['By the way$0'],
				commands: [],
				cursorMarkerOptions: ['instant'],
				regex: false,
				isValid: true
			};

			// Simulate the match that would be found for "btw" at the cursor
			const match: RegExpExecArray & { indices: Array<[number, number]> } = {
				0: 'btw\uE000', // Match includes cursor marker
				index: 'foo\n'.length, // Start position of "btw"
				input: currentText,
				groups: undefined,
				indices: [['foo\n'.length, 'foo\nbtw'.length]] // Will be adjusted by the code
			} as RegExpExecArray & { indices: Array<[number, number]> };

			// Execute the replacement
			await service.replaceText(mockEditor as unknown as Editor, snippet, currentText, match, 'instant');

			// Verify the replacement was correct
			expect(mockEditor.replaceRange).toHaveBeenCalledWith('By the way', { line: 1, ch: 0 }, { line: 1, ch: 3 });

			// Verify cursor positioning
			expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 1, ch: 10 });

			// Critical: verify the final text preserves the newline
			expect(currentText).toBe('foo\nBy the way\nbar');
		});

		it('should handle backspace trigger without extra trailing space', async () => {
			// Reproduce the user's issue:
			// Initial text: "- ["] " (cursor after the quote)
			// User presses backspace -> cursor moves to "- ["]|" (after quote)
			// Trigger matches and should replace with "- [ ]" with cursor after closing bracket

			currentText = '- ["] ';
			mockEditor.getCursor.mockReturnValue({ line: 0, ch: 5 }); // After the quote

			const snippet: ParsedSnippet = {
				id: 'checkbox-backspace',
				trigger: '/\\s*- \\[[^ ]\\] ${0:backspace}/',
				replacement: ['- [ ]$0'], // Note: no space before $0
				commands: [],
				cursorMarkerOptions: ['backspace'],
				regex: true,
				isValid: true
			};

			// The match should be "- ["]" followed by cursor marker
			const match: RegExpExecArray & { indices: Array<[number, number]> } = {
				0: '- ["]\uE000', // Match includes cursor marker
				index: 0, // Start at beginning
				input: currentText,
				groups: undefined,
				indices: [[0, 5]] // Match "- ["]" in original text
			} as RegExpExecArray & { indices: Array<[number, number]> };

			// Execute the replacement with backspace trigger
			await service.replaceText(mockEditor as unknown as Editor, snippet, currentText, match, 'backspace');

			// Should replace "- ["]" with "- [ ]" (no trailing space)
			expect(mockEditor.replaceRange).toHaveBeenCalledWith('- [ ]', { line: 0, ch: 0 }, { line: 0, ch: 5 }); // Full range, no backspace adjustment

			// Cursor should be positioned after the closing bracket
			expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 0, ch: 5 });

			// Final text should be "- [ ] " (preserving the original trailing space)
			expect(currentText).toBe('- [ ] ');
		});
	});
});
