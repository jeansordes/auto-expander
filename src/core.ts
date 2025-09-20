import { Snippet, ParsedSnippet } from './types';
import createDebug from 'debug';
import pluginInfos from '../manifest.json';

const log = createDebug(pluginInfos.id + ':core');

// Cursor marker regex to extract options
const CURSOR_MARKER_REGEX = /\$\{?0(?::([^}]+))?\}?/;

/**
 * Parses cursor marker options from a trigger string
 */
export function parseCursorMarkerOptions(trigger: string): string[] {
	const match = CURSOR_MARKER_REGEX.exec(trigger);
	if (!match) return [];

	const options = match[1];
	if (!options) return [];

	return options.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);
}

/**
 * Parses JSONC string into snippets array
 */
export function parseJsoncSnippets(jsoncString: string): { snippets: Snippet[], error?: string } {
	try {
		// Basic JSONC support - strip comments (simple implementation)
		const cleanedJson = jsoncString
			.replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
			.replace(/\/\/.*$/gm, ''); // Remove // comments

		const snippets: Snippet[] = JSON.parse(cleanedJson);

		if (!Array.isArray(snippets)) {
			return { snippets: [], error: 'Snippets must be an array' };
		}

		// Validate each snippet has required fields
		for (let i = 0; i < snippets.length; i++) {
			const snippet = snippets[i];
			if (!snippet.trigger || typeof snippet.trigger !== 'string') {
				return { snippets: [], error: `Snippet ${i}: trigger field is required and must be a string` };
			}
		}

		return { snippets };
	} catch (error) {
		log('JSONC parsing error:', error);
		return { snippets: [], error: `Invalid JSONC: ${error.message}` };
	}
}

/**
 * Validates snippets and converts them to ParsedSnippet format
 */
export function validateAndParseSnippets(snippets: Snippet[]): ParsedSnippet[] {
	const parsedSnippets: ParsedSnippet[] = [];
	const triggerSet = new Set<string>();

	for (let i = 0; i < snippets.length; i++) {
		const snippet = snippets[i];
		const id = `snippet-${i}`;

		try {
			// Check for duplicate triggers
			if (triggerSet.has(snippet.trigger)) {
				parsedSnippets.push({
					id,
					trigger: snippet.trigger,
					replacement: [],
					commands: [],
					cursorMarkerOptions: [],
					isValid: false,
					error: 'Duplicate trigger'
				});
				continue;
			}

			// Parse cursor marker options
			const cursorMarkerOptions = parseCursorMarkerOptions(snippet.trigger);

			// Normalize replacement to array
			let replacement: string[] = [];
			if (snippet.replacement) {
				if (typeof snippet.replacement === 'string') {
					replacement = [snippet.replacement];
				} else if (Array.isArray(snippet.replacement)) {
					replacement = snippet.replacement.filter((r): r is string => typeof r === 'string');
				}
			}

			// Normalize commands to array
			let commands: string[] = [];
			if (snippet.commands) {
				if (typeof snippet.commands === 'string') {
					commands = [snippet.commands];
				} else if (Array.isArray(snippet.commands)) {
					commands = snippet.commands.filter((c): c is string => typeof c === 'string');
				}
			}

			triggerSet.add(snippet.trigger);

			parsedSnippets.push({
				id,
				trigger: snippet.trigger,
				replacement,
				commands,
				cursorMarkerOptions,
				isValid: true
			});

		} catch (error) {
			log(`Error parsing snippet ${i}:`, error);
			parsedSnippets.push({
				id,
				trigger: snippet.trigger,
				replacement: [],
				commands: [],
				cursorMarkerOptions: [],
				isValid: false,
				error: error.message
			});
		}
	}

	return parsedSnippets;
}

/**
 * Groups snippets by trigger action for efficient lookup
 */
export function createSnippetMap(parsedSnippets: ParsedSnippet[]): Map<string, ParsedSnippet[]> {
	const snippetMap = new Map<string, ParsedSnippet[]>();

	for (const snippet of parsedSnippets) {
		if (!snippet.isValid) continue;

		const options = snippet.cursorMarkerOptions.length > 0 ? snippet.cursorMarkerOptions : ['instant'];

		for (const action of options) {
			if (!snippetMap.has(action)) {
				snippetMap.set(action, []);
			}
			snippetMap.get(action)!.push(snippet);
		}
	}

	return snippetMap;
}
