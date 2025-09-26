import createDebug from 'debug';
import pluginInfos from '../../manifest.json';
import { AutoExpanderSettings, ParsedSnippet, Snippet } from '../types';
import { parseJsoncSnippets, validateAndParseSnippets, createSnippetMap, compileTrigger } from '../core';

const log = createDebug(pluginInfos.id + ':snippet-service');

/**
 * Service for managing snippets loading, validation, and state
 */
export class SnippetService {
	private parsedSnippets: ParsedSnippet[] = [];
	private snippetMap: Map<string, ParsedSnippet[]> = new Map();
	private snippetsValid = true;
	private compiledTriggers = new Map<string, ReturnType<typeof compileTrigger>>();
	private lastValidationError: string | null = null;
	private lastValidSnippets: string = '';

	/**
	 * Load and validate snippets from raw snippet array
	 */
	async loadSnippetsFromRaw(snippets: Snippet[]): Promise<{ error?: string; invalidSnippets?: ParsedSnippet[] }> {
		try {
			this.parsedSnippets = validateAndParseSnippets(snippets);
			this.snippetMap = createSnippetMap(this.parsedSnippets);
			this.snippetsValid = this.parsedSnippets.every(s => s.isValid);

			// Clear compiled triggers cache to ensure fresh compilation
			this.compiledTriggers.clear();

			const invalidCount = this.parsedSnippets.filter(s => !s.isValid).length;
			const invalidSnippets = invalidCount > 0 ? this.parsedSnippets.filter(s => !s.isValid) : undefined;

			if (this.snippetsValid && this.parsedSnippets.length > 0) {
				// Save this as the last valid configuration (serialize back to JSON)
				this.lastValidSnippets = JSON.stringify(snippets, null, 2);
				this.lastValidationError = null;
			} else if (invalidCount > 0) {
				// Collect validation errors for better error reporting
				const errorMessages = invalidSnippets?.map(s => s.error).filter(Boolean) || [];
				this.lastValidationError = (errorMessages.length > 0
					? `Validation errors: ${errorMessages.join('; ')}`
					: 'Unknown validation error') + ' (expansions are disabled)';
			}

			log(`Loaded ${this.parsedSnippets.length} snippets (${invalidCount} invalid)`);
			return { invalidSnippets };
		} catch (error) {
			log('Error loading snippets:', error);
			this.snippetsValid = false;
			this.lastValidationError = `Error loading snippets: ${error.message}`;
			return { error: error.message };
		}
	}

	/**
	 * Load and validate snippets from settings (legacy method)
	 */
	async loadSnippets(_settings: AutoExpanderSettings): Promise<{ error?: string; invalidSnippets?: ParsedSnippet[] }> {
		// Legacy method for backward compatibility - should not be used
		log('Warning: loadSnippets with settings is deprecated, use loadSnippetsFromRaw instead');
		return { error: 'This method is deprecated' };
	}

	/**
	 * Update snippet configuration (legacy method)
	 */
	async updateSnippets(snippetsJsonc: string, _settings: AutoExpanderSettings): Promise<{ error?: string; invalidSnippets?: ParsedSnippet[] }> {
		// Legacy method for backward compatibility - should not be used
		log('Warning: updateSnippets is deprecated, use loadSnippetsFromRaw instead');
		try {
			const { snippets, error: parseError } = parseJsoncSnippets(snippetsJsonc);
			if (parseError) {
				return { error: parseError };
			}
			return await this.loadSnippetsFromRaw(snippets);
		} catch (error) {
			return { error: error.message };
		}
	}

	/**
	 * Get parsed snippets
	 */
	getParsedSnippets(): ParsedSnippet[] {
		return [...this.parsedSnippets];
	}

	/**
	 * Get snippet map for efficient lookup
	 */
	getSnippetMap(): Map<string, ParsedSnippet[]> {
		return new Map(this.snippetMap);
	}

	/**
	 * Check if snippets are in a valid state
	 */
	areSnippetsValid(): boolean {
		return this.snippetsValid;
	}

	/**
	 * Get the last validation error message
	 */
	getLastValidationError(): string | null {
		return this.lastValidationError;
	}

	/**
	 * Reset snippets to the last valid configuration
	 */
	async resetToLastValidSnippets(settings: AutoExpanderSettings): Promise<{ error?: string }> {
		if (!this.lastValidSnippets) {
			const error = 'No valid snippet configuration available to reset to';
			log(error);
			return { error };
		}

		log('Resetting to last valid snippet configuration');
		return await this.updateSnippets(this.lastValidSnippets, settings);
	}

	/**
	 * Get validation status with detailed information
	 */
	getValidationStatus(): {
		isValid: boolean;
		totalSnippets: number;
		validSnippets: number;
		invalidSnippets: number;
		lastError: string | null;
		canReset: boolean;
	} {
		const totalSnippets = this.parsedSnippets.length;
		const validSnippets = this.parsedSnippets.filter(s => s.isValid).length;
		const invalidSnippets = totalSnippets - validSnippets;

		return {
			isValid: this.snippetsValid,
			totalSnippets,
			validSnippets,
			invalidSnippets,
			lastError: this.lastValidationError,
			canReset: !!this.lastValidSnippets
		};
	}

	/**
	 * Get compiled trigger for a snippet
	 */
	getCompiledTrigger(trigger: string): ReturnType<typeof compileTrigger> | undefined {
		const cacheKey = `trigger:${trigger}`;
		let compiledTrigger = this.compiledTriggers.get(cacheKey);
		if (!compiledTrigger) {
			compiledTrigger = compileTrigger(trigger);
			this.compiledTriggers.set(cacheKey, compiledTrigger);
		}
		return compiledTrigger;
	}
}
