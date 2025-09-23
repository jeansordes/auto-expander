import { Notice } from 'obsidian';
import createDebug from 'debug';
import pluginInfos from '../manifest.json';
import { extractMatchIndices, getCursorGroup, getMatchRange } from './utils/regex-indices';
import { parseCursorMarkerOptions } from './snippet-utils';

export {
	parseCursorMarkerOptions,
	parseJsoncSnippets,
	validateAndParseSnippets,
	createSnippetMap
} from './snippet-utils';

const log = createDebug(pluginInfos.id + ':core');

// Cursor marker regex to extract options (single match)
const CURSOR_MARKER_REGEX = /\$\{?0(?::([^}]+))?\}?/;
// Global variant for iterating through cursor markers
const CURSOR_MARKER_GLOBAL_REGEX = /\$\{?0(?::([^}]+))?\}?/g;

const MATCH_SAFEGUARD_DURATION_MS = 5000;
const MATCH_TIMEOUT_NOTICE_DURATION_MS = 5000;
const MATCH_TIMEOUT_NOTICE_COOLDOWN_MS = 30000;
let lastMatchTimeoutNoticeAt = 0;

/** Escape special regex characters in a literal string */
function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface TriggerProcessingResult {
    pattern: string;
    options: string[];
    foundCursorMarker: boolean;
}

function processTriggerPattern(source: string, escapeLiterals: boolean): TriggerProcessingResult {
    const parts: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let options: string[] = [];
    let foundCursorMarker = false;

    CURSOR_MARKER_GLOBAL_REGEX.lastIndex = 0;

    while ((match = CURSOR_MARKER_GLOBAL_REGEX.exec(source)) !== null) {
		const literalChunk = source.slice(lastIndex, match.index);
		parts.push(escapeLiterals ? escapeRegex(literalChunk) : literalChunk);
		parts.push('(?<CURSOR>)');

		if (!foundCursorMarker) {
			const markerOptions = match[1] ? parseCursorMarkerOptions(match[0]) : ['instant'];
            options = markerOptions.length > 0 ? markerOptions : ['instant'];
        }

        foundCursorMarker = true;
        lastIndex = match.index + match[0].length;
    }

    const trailingChunk = source.slice(lastIndex);
    parts.push(escapeLiterals ? escapeRegex(trailingChunk) : trailingChunk);

    return {
        pattern: parts.join(''),
        options,
        foundCursorMarker
    };
}

/**
 * Compiles a trigger string into regex and options for matching
 * Supports both explicit regex triggers and automatic escaping
 */
export function compileTrigger(
	trigger: string,
	isRegex: boolean = false
): { regex: RegExp; options: string[]; hasCursorMarker: boolean; isExplicitRegex: boolean; allowsFlexibleCursor: boolean } {
	const isExplicitRegex = trigger.startsWith('/') && trigger.endsWith('/') && trigger.length > 2;

	let processedTrigger: string;
	let options: string[] = [];
	let hasCursorMarker = false;
	let allowsFlexibleCursor = false;

		if (isExplicitRegex || isRegex) {
			// Don't escape regex patterns (either explicit /.../ or marked as regex: true)
			let patternToProcess = trigger;
			if (isExplicitRegex) {
				patternToProcess = trigger.slice(1, -1);
			}

			// For regex triggers, modify the pattern to support cursor anywhere within the match
			if (isRegex && !isExplicitRegex) {
				// Check if cursor marker is at the beginning
				CURSOR_MARKER_REGEX.lastIndex = 0;
				const cursorMatch = CURSOR_MARKER_REGEX.exec(patternToProcess);

				if (cursorMatch && cursorMatch.index === 0) {
					// Cursor marker is at the beginning - for flexible cursor positioning,
					// remove the cursor marker and allow matching anywhere in the pattern
					const markerOptions = cursorMatch[1] ? parseCursorMarkerOptions(cursorMatch[0]) : ['instant'];
					options = markerOptions.length > 0 ? markerOptions : ['instant'];
					hasCursorMarker = true;
					allowsFlexibleCursor = true;

					// Remove cursor marker and keep the user's pattern
					const userPattern = patternToProcess.slice(cursorMatch[0].length);
					processedTrigger = userPattern;

					log(`Processing regex trigger with flexible cursor positioning: ${processedTrigger}`);
				} else {
					// Cursor marker is elsewhere or not present - use standard processing
					const result = processTriggerPattern(patternToProcess, false);
					processedTrigger = result.pattern;
					options = result.foundCursorMarker ? result.options : ['instant'];
					hasCursorMarker = result.foundCursorMarker;
					log(`Processing regex trigger with standard processing: ${processedTrigger}`);
				}
        } else {
            // Use the original processing for explicit regex or fallback
            const result = processTriggerPattern(patternToProcess, false);
            processedTrigger = result.pattern;
            options = result.foundCursorMarker ? result.options : [];
            hasCursorMarker = result.foundCursorMarker;
            log(`Processing ${isExplicitRegex ? 'explicit' : 'fallback'} trigger: ${processedTrigger}`);
        }

        if (!hasCursorMarker && !/(?<CURSOR>)/.test(processedTrigger)) {
            log(`${isExplicitRegex ? 'Explicit' : 'Regex'} trigger without cursor marker detected; matching relies on user-provided pattern`);
        }
    } else {
        // Escape literal patterns
        const result = processTriggerPattern(trigger, true);
        processedTrigger = result.pattern;
        options = result.foundCursorMarker ? result.options : ['instant'];
        hasCursorMarker = result.foundCursorMarker;

        if (!hasCursorMarker) {
            processedTrigger += '(?<CURSOR>)';
        }
    }

	try {
		const regex = new RegExp(processedTrigger, 'dg');

		log(`Compiled trigger "${trigger}" -> pattern: /${processedTrigger}/dg`);

		return {
			regex,
			options: options.length > 0 ? options : ['instant'],
			hasCursorMarker,
			isExplicitRegex,
			allowsFlexibleCursor
		};
	} catch (error) { 
		log(`Error compiling regex for trigger "${trigger}":`, error);
		const escapedTrigger = escapeRegex(trigger) + '(?<CURSOR>)';
		return {
			regex: new RegExp(escapedTrigger, 'dg'),
			options: ['instant'],
			hasCursorMarker: false,
			isExplicitRegex: false,
			allowsFlexibleCursor: false
		};
	}
}

function eventTypeAllowed(eventType: string, options: string[]): boolean {
    if (options.length === 0) return true;
    if (options.includes(eventType)) return true;
    if (eventType === 'enter' && options.includes('newline')) return true;
    if (eventType === 'newline' && options.includes('enter')) return true;
    return false;
}

/**
 * Tests if a compiled trigger matches the given input at cursor position
 * Handles both explicit regex triggers and standard cursor marker triggers
 */
export function matchesTrigger(
		compiledTrigger: { regex: RegExp; options: string[]; isExplicitRegex?: boolean; allowsFlexibleCursor?: boolean },
		input: string,
		cursorPos: number,
		eventType: string
	): boolean {
	const regex = compiledTrigger.regex;
	let match: RegExpExecArray | null = null;
	let matchFound = false;
	let guardTimedOut = false;
	let explicitRegexMatched = false;
	let iterationCount = 0;
	const startTime = Date.now();

	try {
		regex.lastIndex = 0;

		while ((match = regex.exec(input)) !== null) {
			iterationCount++;
			log(`Regex match found: "${match[0]}" at position ${match.index} (iteration ${iterationCount})`);

			const elapsed = Date.now() - startTime;
			if (elapsed > MATCH_SAFEGUARD_DURATION_MS) {
				guardTimedOut = true;
				log(`Regex matching exceeded ${MATCH_SAFEGUARD_DURATION_MS}ms after ${iterationCount} iteration(s); aborting to prevent hang`);
				break;
			}

			if (compiledTrigger.isExplicitRegex) {
				explicitRegexMatched = true;
				matchFound = true;
				break;
			}

				const indices = extractMatchIndices(match);
				const matchRange = indices ? getMatchRange(indices) : undefined;
				const matchStart = matchRange ? matchRange[0] : match.index;
				const matchEnd = matchRange ? matchRange[1] : match.index + match[0].length;
				const cursorGroup = indices ? getCursorGroup(indices) : undefined;

				if (!indices) {
					log('Match indices not available; using fallback range based on match.index');
				}

			if (!compiledTrigger.allowsFlexibleCursor) {
				if (cursorGroup) {
					const [cursorStart, cursorEnd] = cursorGroup;
					const cursorWithinMarker = cursorPos >= cursorStart && cursorPos <= cursorEnd;
					log(`Cursor marker check: markerRange=[${cursorStart}, ${cursorEnd}], cursorPos=${cursorPos}, withinMarker=${cursorWithinMarker}`);

					if (!cursorWithinMarker) {
						continue;
					}

					matchFound = true;
					break;
				}

				const cursorAtMatchEnd = cursorPos === matchEnd;
				log(`Fallback cursor check: matchEnd=${matchEnd}, cursorPos=${cursorPos}, cursorAtMatchEnd=${cursorAtMatchEnd}`);

				if (!cursorAtMatchEnd) {
					continue;
				}

				matchFound = true;
				break;
			}

			const cursorWithinMatch = cursorPos >= matchStart && cursorPos <= matchEnd;
			log(`Flexible cursor check: matchRange=[${matchStart}, ${matchEnd}], cursorPos=${cursorPos}, cursorWithinMatch=${cursorWithinMatch}`);

			if (cursorWithinMatch) {
				matchFound = true;
				break;
			}
		}

		if (guardTimedOut) {
			const now = Date.now();
			if (now - lastMatchTimeoutNoticeAt > MATCH_TIMEOUT_NOTICE_COOLDOWN_MS) {
				lastMatchTimeoutNoticeAt = now;
				new Notice('Auto Expander: regex matching timed out after 5s. Please review your trigger pattern.', MATCH_TIMEOUT_NOTICE_DURATION_MS);
			}
			log('Regex matching timed out; returning false');
			return false;
		}

		if (!matchFound) {
			log(`No regex match found containing cursor at position ${cursorPos}`);
			return false;
		}

		const optionsAllowed = eventTypeAllowed(eventType, compiledTrigger.options);
		return optionsAllowed;
	} catch (error) {
		log('Error matching trigger:', error);
		return false;
	} finally {
		regex.lastIndex = 0;
	}
}
