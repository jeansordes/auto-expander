import { Notice } from 'obsidian';
import createDebug from 'debug';
import pluginInfos from '../manifest.json';
// Note: regex-indices utilities are no longer used after switching to Unicode marker approach
import { parseCursorMarkerOptions } from './snippet-utils';

export {
	parseCursorMarkerOptions,
	parseJsoncSnippets,
	validateAndParseSnippets,
	createSnippetMap
} from './snippet-utils';

const log = createDebug(pluginInfos.id + ':core');

// Unicode Private Use Area character used to mark cursor position in text
const CURSOR_MARKER_CHAR = '\uE000';

// Cursor marker regex to extract options (single match)
const _CURSOR_MARKER_REGEX = /\$\{?0(?::([^}]+))?\}?/;
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
		parts.push(CURSOR_MARKER_CHAR);

		if (!foundCursorMarker) {
			const markerOptions = match[1] ? parseCursorMarkerOptions(match[0]) : ['instant'];
            options = markerOptions.length > 0 ? markerOptions : ['instant'];
        }

        foundCursorMarker = true;
        lastIndex = match.index + match[0].length;
    }

    const trailingChunk = source.slice(lastIndex);
    const processedChunk = escapeLiterals ? escapeRegex(trailingChunk) : trailingChunk; 

    parts.push(processedChunk);

    return {
        pattern: parts.join(''),
        options,
        foundCursorMarker
    };
}

/**
 * Compiles a trigger string into regex and options for matching
 * Regex triggers are detected by /.../ syntax, literal strings are automatically escaped
 */
export function compileTrigger(
	trigger: string
): { regex: RegExp; options: string[]; hasCursorMarker: boolean; isExplicitRegex: boolean; allowsFlexibleCursor: boolean } {
	const isExplicitRegex = trigger.startsWith('/') && trigger.endsWith('/') && trigger.length > 2;

	let processedTrigger: string;
	let options: string[] = [];
	let hasCursorMarker = false;
	const allowsFlexibleCursor = false;

	if (isExplicitRegex) {
		// Explicit regex trigger: use the pattern inside the slashes without escaping
		const patternToProcess = trigger.slice(1, -1);

		// Use standard processing for all explicit regex triggers
		const result = processTriggerPattern(patternToProcess, false);
		processedTrigger = result.pattern;
		options = result.foundCursorMarker ? result.options : ['instant'];
		hasCursorMarker = result.foundCursorMarker;

		if (!hasCursorMarker && !processedTrigger.includes(CURSOR_MARKER_CHAR)) {
			log(`Explicit regex trigger without cursor marker detected; matching relies on user-provided pattern`);
		}
    } else {
        // Escape literal patterns
        const result = processTriggerPattern(trigger, true);
        processedTrigger = result.pattern;
        options = result.foundCursorMarker ? result.options : ['instant'];
        hasCursorMarker = result.foundCursorMarker;

        if (!hasCursorMarker) {
            processedTrigger += CURSOR_MARKER_CHAR;
        }
    }

	try {
		const regex = new RegExp(processedTrigger, 'dgm');

		log(`Compiled trigger "${trigger}" -> pattern: /${processedTrigger}/dgm`);

		return {
			regex,
			options: options.length > 0 ? options : ['instant'],
			hasCursorMarker,
			isExplicitRegex,
			allowsFlexibleCursor
		};
	} catch (error) {
		log(`Error compiling regex for trigger "${trigger}":`, error);
		const escapedTrigger = escapeRegex(trigger) + CURSOR_MARKER_CHAR;
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
 * Uses Unicode Private Use Area character to mark cursor position
 */
export function matchesTrigger(
		compiledTrigger: { regex: RegExp; options: string[]; isExplicitRegex?: boolean; allowsFlexibleCursor?: boolean },
		input: string,
		cursorPos: number,
		eventType: string
	): boolean {
	const regex = compiledTrigger.regex;
	let matchFound = false;
	let guardTimedOut = false;
	let iterationCount = 0;
	const startTime = Date.now();

	try {
		// Insert cursor marker character at cursor position
		const textWithCursor = input.slice(0, cursorPos) + CURSOR_MARKER_CHAR + input.slice(cursorPos);

		log(`Testing trigger with cursor at position ${cursorPos}, text length: ${input.length} -> ${textWithCursor.length}`);

		regex.lastIndex = 0;

		let match: RegExpExecArray | null = null;
		while ((match = regex.exec(textWithCursor)) !== null) {
			iterationCount++;
			log(`Regex match found: "${match[0]}" at position ${match.index} (iteration ${iterationCount})`);

			const elapsed = Date.now() - startTime;
			if (elapsed > MATCH_SAFEGUARD_DURATION_MS) {
				guardTimedOut = true;
				log(`Regex matching exceeded ${MATCH_SAFEGUARD_DURATION_MS}ms after ${iterationCount} iteration(s); aborting to prevent hang`);
				break;
			}

			// If we find a match that contains the cursor marker, it's a valid match
			if (match[0].includes(CURSOR_MARKER_CHAR)) {
				matchFound = true;
				log(`Match contains cursor marker at position ${cursorPos}`);
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
