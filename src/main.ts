import { Editor, MarkdownView, Notice, Plugin } from 'obsidian';
import createDebug from 'debug';
import pluginInfos from '../manifest.json';
import { AutoExpanderSettings, DEFAULT_SETTINGS, ParsedSnippet } from './types';
import { parseJsoncSnippets, validateAndParseSnippets, createSnippetMap } from './core';
import { AutoExpanderSettingTab } from './ui/settings';

const log = createDebug(pluginInfos.id + ':main');

export default class AutoExpander extends Plugin {
	settings: AutoExpanderSettings;

	// Parsed and validated snippets
	private parsedSnippets: ParsedSnippet[] = [];
	// Map of trigger actions to snippets for efficient lookup
	private snippetMap: Map<string, ParsedSnippet[]> = new Map();
	// Whether snippets are in a valid state
	private snippetsValid = true;

	async onload() {
		// Toggle debug output dynamically using debug.enable/disable
        // Dev: enable our namespaces; Prod: disable all
        try {
            const isProd = process.env.NODE_ENV === 'production';
            if (isProd) {
                createDebug.disable();
            } else {
                createDebug.enable(pluginInfos.id + ':*');
            }
        } catch {
            log("Debug toggling failed");
        }

        log("Plugin loading");

		await this.loadSettings();

		// Load and validate snippets
		await this.loadSnippets();

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: pluginInfos.id + '-editor-command',
			name: pluginInfos.name + ' editor command',
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				log(editor.getSelection());
				editor.replaceSelection(pluginInfos.name + ' Editor Command');
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AutoExpanderSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {
		log("Plugin unloading");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Load and validate snippets from settings
	 */
	private async loadSnippets(): Promise<{ error?: string; invalidSnippets?: ParsedSnippet[] }> {
		try {
			const { snippets, error: parseError } = parseJsoncSnippets(this.settings.snippetsJsonc);

			if (parseError) {
				log('JSONC parsing failed:', parseError);
				this.snippetsValid = false;
				return { error: parseError };
			}

			this.parsedSnippets = validateAndParseSnippets(snippets);
			this.snippetMap = createSnippetMap(this.parsedSnippets);
			this.snippetsValid = this.parsedSnippets.every(s => s.isValid);

			const invalidCount = this.parsedSnippets.filter(s => !s.isValid).length;
			const invalidSnippets = invalidCount > 0 ? this.parsedSnippets.filter(s => !s.isValid) : undefined;

			if (this.parsedSnippets.length > 0 && invalidCount === 0) {
				new Notice(`Loaded ${this.parsedSnippets.length} snippet(s) successfully.`);
			}

			log(`Loaded ${this.parsedSnippets.length} snippets (${invalidCount} invalid)`);
			return { invalidSnippets };
		} catch (error) {
			log('Error loading snippets:', error);
			this.snippetsValid = false;
			return { error: error.message };
		}
	}

	/**
	 * Update snippet configuration
	 */
	async updateSnippets(snippetsJsonc: string): Promise<{ error?: string; invalidSnippets?: ParsedSnippet[] }> {
		this.settings.snippetsJsonc = snippetsJsonc;
		await this.saveSettings();
		return await this.loadSnippets();
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
}