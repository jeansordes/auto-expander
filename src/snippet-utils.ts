import createDebug from 'debug';
import JSON5 from 'json5';
import pluginInfos from '../manifest.json';
import { Snippet, ParsedSnippet } from './types';

const snippetLog = createDebug(`${pluginInfos.id}:snippets`);

const VALID_TRIGGER_OPTIONS = ['instant', 'space', 'tab', 'enter', 'newline', 'backspace'];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function parseCursorMarkerOptions(trigger: string): string[] {
	const cursorMarkerMatch = trigger.match(/\$\{?0(?::([^}]+))?\}?/);
	if (!cursorMarkerMatch) {
		return [];
	}
	const optionsSegment = cursorMarkerMatch[1];
	if (!optionsSegment) {
		return [];
	}
	return optionsSegment
		.split(',')
		.map((option) => option.trim())
		.filter((option) => option.length > 0 && VALID_TRIGGER_OPTIONS.includes(option));
}

export function parseJsoncSnippets(jsoncString: string): { snippets: Snippet[]; error?: string } {
	try {
		const rawInput = jsoncString ?? '';
		if (rawInput.trim().length === 0) {
			return { snippets: [] };
		}

		const parsed = JSON5.parse(rawInput);
		if (!Array.isArray(parsed)) {
			return { snippets: [], error: 'Snippets must be an array' };
		}

		const snippets: Snippet[] = [];
		for (let i = 0; i < parsed.length; i++) {
			const candidate = parsed[i];
			if (!isRecord(candidate)) {
				return { snippets: [], error: `Snippet ${i}: must be an object` };
			}
			const { trigger, replacement, commands, regex } = candidate;
			if (typeof trigger !== 'string' || trigger.trim().length === 0) {
				return { snippets: [], error: `Snippet ${i}: trigger field is required and must be a string` };
			}

			if (replacement !== undefined) {
				if (typeof replacement !== 'string' && !isStringArray(replacement)) {
					return { snippets: [], error: `Snippet ${i}: replacement must be a string or array of strings` };
				}
			}

			if (commands !== undefined) {
				if (typeof commands !== 'string' && !isStringArray(commands)) {
					return { snippets: [], error: `Snippet ${i}: commands must be a string or array of strings` };
				}
			}

			if (regex !== undefined && typeof regex !== 'boolean') {
				return { snippets: [], error: `Snippet ${i}: regex must be a boolean` };
			}

			const snippet: Snippet = { trigger };
			if (typeof replacement === 'string') {
				snippet.replacement = replacement;
			} else if (replacement !== undefined && isStringArray(replacement)) {
				snippet.replacement = replacement;
			}
			if (typeof commands === 'string') {
				snippet.commands = commands;
			} else if (commands !== undefined && isStringArray(commands)) {
				snippet.commands = commands;
			}
			if (typeof regex === 'boolean') {
				snippet.regex = regex;
			}

			snippets.push(snippet);
		}

		return { snippets };
	} catch (error) {
		let message = error instanceof Error ? error.message : 'Unknown error';
		if (message.startsWith('JSON5: ')) {
			message = message.slice(7);
		}
		snippetLog('JSONC parsing error:', error);
		return { snippets: [], error: `Invalid JSONC: ${message}` };
	}
}

export function validateAndParseSnippets(snippets: Snippet[]): ParsedSnippet[] {
	const parsedSnippets: ParsedSnippet[] = [];
	const triggerSet = new Set<string>();
	for (let i = 0; i < snippets.length; i++) {
		const snippet = snippets[i];
		const id = `snippet-${i}`;
		try {
			if (triggerSet.has(snippet.trigger)) {
				parsedSnippets.push({
					id,
					trigger: snippet.trigger,
					replacement: [],
					commands: [],
					cursorMarkerOptions: [],
					regex: snippet.regex === true,
					isValid: false,
					error: 'Duplicate trigger'
				});
				continue;
			}
			const cursorMarkerOptions = parseCursorMarkerOptions(snippet.trigger);
			let replacement: string[] = [];
			if (snippet.replacement) {
				if (typeof snippet.replacement === 'string') {
					replacement = [snippet.replacement];
				} else if (Array.isArray(snippet.replacement)) {
					replacement = snippet.replacement.filter((entry): entry is string => typeof entry === 'string');
				}
			}
			let commands: string[] = [];
			if (snippet.commands) {
				if (typeof snippet.commands === 'string') {
					commands = [snippet.commands];
				} else if (Array.isArray(snippet.commands)) {
					commands = snippet.commands.filter((entry): entry is string => typeof entry === 'string');
				}
			}
			const regex = snippet.regex === true;
			triggerSet.add(snippet.trigger);
			parsedSnippets.push({
				id,
				trigger: snippet.trigger,
				replacement,
				commands,
				cursorMarkerOptions,
				regex,
				isValid: true
			});
		} catch (error) {
			snippetLog(`Error parsing snippet ${i}:`, error);
			parsedSnippets.push({
				id,
				trigger: snippet.trigger,
				replacement: [],
				commands: [],
				cursorMarkerOptions: [],
				regex: snippet.regex === true,
				isValid: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	}
	return parsedSnippets;
}

export function createSnippetMap(parsedSnippets: ParsedSnippet[]): Map<string, ParsedSnippet[]> {
	const snippetMap = new Map<string, ParsedSnippet[]>();
	for (const snippet of parsedSnippets) {
		if (!snippet.isValid) {
			continue;
		}
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
