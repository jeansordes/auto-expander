import { Editor } from 'obsidian';
import createDebug from 'debug';
import pluginInfos from '../../manifest.json';
import type { ParsedSnippet } from '../types';
import { charIndexToEditorPos } from '../utils/editor-position';

const log = createDebug(`${pluginInfos.id}:text-replacement`);

type MatchIndices = Array<[number, number]> & {
	groups?: Record<string, [number, number] | undefined>;
};

export class TextReplacementService {
	/**
	 * Replaces text in the editor based on the snippet configuration
	 * Handles cursor positioning and capture group substitution
	 * Returns a Promise that resolves when the replacement is complete
	 */
	async replaceText(
		editor: Editor,
		snippet: ParsedSnippet,
		currentText: string,
		match: RegExpExecArray,
		triggerAction: string
	): Promise<void> {
		if (snippet.replacement.length === 0) {
			return;
		}

		const indices = this.getMatchIndices(match);
		if (!indices) {
			log('No indices found in current regex match');
			return;
		}

		const range = this.getMatchRange(indices);
		if (!range) {
			log('Invalid match indices format');
			return;
		}

		const adjustedRange = this.adjustRangeForBackspace(range, triggerAction);
		const prepared = this.prepareReplacementText(snippet, match);
		const replacementStartIndex = adjustedRange.start;

		this.performReplacement(editor, currentText, adjustedRange, prepared.text);

		// Wait for the replacement to be fully applied before moving the cursor
		await this.waitForReplacementToComplete(editor, replacementStartIndex, prepared.text);
		this.positionCursor(editor, replacementStartIndex, prepared.cursorPos);
	}

	/**
	 * Prepares the replacement text by removing cursor markers and substituting capture groups
	 * Returns both the final replacement text and the cursor position within it
	 */
	private prepareReplacementText(snippet: ParsedSnippet, match: RegExpExecArray): { text: string; cursorPos: number } {
		const originalText = snippet.replacement.join('\n');
		const cursorMarkerPos = this.findCursorPositionInReplacement(originalText);

		if (cursorMarkerPos === -1) {
			// No cursor marker, cursor goes to end
			let replacementText = this.removeCursorMarkers(originalText);
			replacementText = this.substituteCaptureGroups(replacementText, match);
			return { text: replacementText, cursorPos: replacementText.length };
		}

		// Split the text at the cursor marker
		const beforeCursor = originalText.slice(0, cursorMarkerPos);
		const afterCursor = originalText.slice(cursorMarkerPos + this.getCursorMarkerLength(originalText, cursorMarkerPos));

		// Process the parts separately
		let beforeText = this.removeCursorMarkers(beforeCursor);
		beforeText = this.substituteCaptureGroups(beforeText, match);

		let afterText = this.removeCursorMarkers(afterCursor);
		afterText = this.substituteCaptureGroups(afterText, match);

		const finalText = beforeText + afterText;
		const cursorPos = beforeText.length;

		log(`Replacement prepared: "${finalText}" with cursor at position ${cursorPos}`);
		return { text: finalText, cursorPos };
	}

	/**
	 * Performs the actual text replacement in the editor
	 */
	private performReplacement(
		editor: Editor,
		currentText: string,
		range: { start: number; end: number },
		replacementText: string
	): void {
		const startPos = charIndexToEditorPos(currentText, range.start);
		const endPos = charIndexToEditorPos(currentText, range.end);
		const textToReplace = editor.getRange(startPos, endPos);

		log(`About to replace: "${textToReplace}" with "${replacementText}"`);
		log(`Replacement positions: ${startPos.line}:${startPos.ch} to ${endPos.line}:${endPos.ch}`);

		editor.replaceRange(replacementText, startPos, endPos);
	}

	/**
	 * Positions the cursor at the specified position in the replacement text
	 */
	private positionCursor(editor: Editor, replacementStartIndex: number, cursorPosInReplacement: number): void {
		const textAfterReplacement = editor.getValue();
		const cursorPosInFinalText = replacementStartIndex + cursorPosInReplacement;

		if (cursorPosInFinalText >= 0 && cursorPosInFinalText <= textAfterReplacement.length) {
			const cursorEditorPos = charIndexToEditorPos(textAfterReplacement, cursorPosInFinalText);
			editor.setCursor(cursorEditorPos);
			log(`Cursor positioned at: ${cursorEditorPos.line}:${cursorEditorPos.ch} (char index: ${cursorPosInFinalText})`);
		} else {
			log(`Warning: Calculated cursor position ${cursorPosInFinalText} is out of bounds (text length: ${textAfterReplacement.length})`);
		}
	}

	/**
	 * Finds the position of the $0 cursor marker in replacement text
	 */
	private findCursorPositionInReplacement(replacementText: string): number {
		const cursorRegex = /\$\{?0(?::[^}]*)?\}?/;
		const match = cursorRegex.exec(replacementText);

		if (match) {
			log(`Found cursor marker "${match[0]}" at position ${match.index} in replacement text`);
			return match.index;
		}

		log('No cursor marker found in replacement text');
		return -1;
	}

	/**
	 * Gets the length of the cursor marker at the given position
	 */
	private getCursorMarkerLength(replacementText: string, position: number): number {
		const cursorRegex = /\$\{?0(?::[^}]*)?\}?/;
		cursorRegex.lastIndex = position;
		const match = cursorRegex.exec(replacementText);

		if (match && match.index === position) {
			return match[0].length;
		}

		return 0;
	}

	/**
	 * Removes cursor markers ($0, ${0}, etc.) from replacement text
	 */
	private removeCursorMarkers(text: string): string {
		return text.replace(/\$\{?0(?::[^}]*)?\}?/g, '');
	}

	/**
	 * Substitutes capture groups ($1, $2, etc.) with actual captured values
	 */
	private substituteCaptureGroups(text: string, match: RegExpExecArray): string {
		log(`Substituting capture groups in text: "${text}"`);
		log(`Full match (index 0): "${match[0]}"`);
		log(`Total match array length: ${match.length}`);

		// Log all captured groups
		for (let i = 1; i < match.length; i++) {
			const groupValue = match[i];
			log(`Capture group $${i}: "${groupValue !== undefined ? groupValue : 'undefined'}"`);
		}

		// Log named groups if they exist
		if ('groups' in match && match.groups) {
			log(`Named groups found: ${Object.keys(match.groups).length}`);
			for (const [name, value] of Object.entries(match.groups)) {
				log(`Named group "${name}": "${value !== undefined ? value : 'undefined'}"`);
			}
		} else {
			log('No named groups found');
		} 

		const result = text.replace(/\$(\d+)/g, (matchStr, groupIndex) => {
			const index = parseInt(groupIndex, 10);

			// Handle case where first capture group is empty (happens when regex patterns have
			// non-matching groups at the beginning, like \n that doesn't match after cursor)
			let actualIndex = index;
			if (index > 1 && match[1] === '') {
				// Shift indices: $2 becomes $1, $3 becomes $2, etc.
				// This handles patterns like /(?<CURSOR>)\n(group1)(group2)/ where \n doesn't match
				actualIndex = index - 1;
			}

			const replacement = match[actualIndex];
			if (replacement === undefined) {
				log(`Warning: Capture group $${groupIndex} (actual index ${actualIndex}) is undefined, keeping original: "${matchStr}"`);
				return matchStr;
			}

			log(`Replacing $${groupIndex} with: "${replacement}"`);
			return replacement;
		});

		log(`Final substituted text: "${result}"`);
		return result;
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
	 * Gets the start and end character indices for the match
	 */
	private getMatchRange(indices: MatchIndices): { start: number; end: number } | null {
		const range = indices[0];
		if (!Array.isArray(range) || range.length < 2) {
			return null;
		}
		const [start, end] = range;
		if (typeof start !== 'number' || typeof end !== 'number') {
			return null;
		}
		return { start, end };
	}

	/**
	 * Adjusts match range for backspace trigger action
	 */
	private adjustRangeForBackspace(range: { start: number; end: number }, triggerAction: string): { start: number; end: number } {
		if (triggerAction !== 'backspace') {
			return range;
		}
		const adjustedEnd = Math.max(range.start, range.end - 1);
		return { start: range.start, end: adjustedEnd };
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

	/**
	 * Waits for the text replacement to be fully applied in the editor
	 * Uses a combination of timeout and content verification for reliability
	 */
	private async waitForReplacementToComplete(
		editor: Editor,
		replacementStartIndex: number,
		expectedText: string
	): Promise<void> {
		const maxWaitTime = 200; // Maximum wait time in milliseconds
		const checkInterval = 10; // Check every 10ms
		const requiredStableChecks = 2;
		const startTime = Date.now();
		let stableChecks = 0;

		return new Promise((resolve) => {
			const checkReplacement = () => {
				const currentText = editor.getValue();
				const replacementApplied = this.isReplacementApplied(
					editor,
					currentText,
					replacementStartIndex,
					expectedText
				);

				if (replacementApplied) {
					stableChecks += 1;
					if (stableChecks >= requiredStableChecks) {
						log(`Text replacement confirmed complete after ${Date.now() - startTime}ms`);
						resolve();
						return;
					}
				} else {
					stableChecks = 0;
				}

				const elapsedTime = Date.now() - startTime;
				if (elapsedTime >= maxWaitTime) {
					log(`Text replacement wait timeout after ${elapsedTime}ms, proceeding anyway`);
					resolve();
					return;
				}

				// Continue checking
				window.setTimeout(checkReplacement, checkInterval);
			};

			// Start checking immediately
			checkReplacement();
		});
	}

	private isReplacementApplied(
		editor: Editor,
		currentText: string,
		replacementStartIndex: number,
		expectedText: string
	): boolean {
		if (expectedText.length === 0) {
			return true;
		}

		if (replacementStartIndex < 0 || replacementStartIndex > currentText.length) {
			log('Replacement start index out of bounds when verifying replacement');
			return false;
		}

		const startPos = charIndexToEditorPos(currentText, replacementStartIndex);
		const endIndex = Math.min(replacementStartIndex + expectedText.length, currentText.length);
		const endPos = charIndexToEditorPos(currentText, endIndex);
		const textInRange = editor.getRange(startPos, endPos);

		return textInRange === expectedText;
	}
}
