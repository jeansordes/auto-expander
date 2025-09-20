import { Editor, MarkdownView, Plugin } from 'obsidian';
import createDebug from 'debug';
import pluginInfos from '../manifest.json';
import { AutoExpanderSettings, ParsedSnippet } from './types';
import { AutoExpanderSettingTab } from './ui/settings';
import { SettingsService } from './services/settings-service';
import { SnippetService } from './services/snippet-service';
import { ExpansionService, TriggerContext } from './services/expansion-service';
import { matchesTrigger } from './core';

const log = createDebug(pluginInfos.id + ':main');

export default class AutoExpander extends Plugin {
	settings: AutoExpanderSettings;

	// Service instances
	private settingsService: SettingsService;
	private snippetService: SnippetService;
	private expansionService: ExpansionService;

	// Event listener cleanup function
	private unregisterExpansionListener?: () => void;

	async onload() {
		this.initializeServices();
		this.configureDebugging();
		await this.initializePlugin();

		log("Plugin loaded successfully");
	}

	/**
	 * Initialize service instances
	 */
	private initializeServices(): void {
		this.settingsService = new SettingsService(this);
		this.snippetService = new SnippetService();
		this.expansionService = new ExpansionService(this.app);
	}

	/**
	 * Configure debug logging based on environment
	 */
	private configureDebugging(): void {
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
	}

	/**
	 * Initialize plugin components and setup
	 */
	private async initializePlugin(): Promise<void> {
		// Load settings
		this.settings = await this.settingsService.loadSettings();

		// Load and validate snippets
		await this.snippetService.loadSnippets(this.settings);

		// Set initial delays
		this.expansionService.updateCommandDelay(this.settings.commandDelay);

		// Add status bar item
		this.setupStatusBarItem();

		// Add editor command
		this.addEditorCommand();

		// Add settings tab
		this.addSettingTab(new AutoExpanderSettingTab(this.app, this));

		// Set up expansion mechanism
		this.setupExpansionMechanism();

		// Register global event listeners
		this.registerGlobalEvents();
	}

	onunload() {
		this.cleanup();
		log("Plugin unloaded successfully");
	}

	/**
	 * Add status bar item
	 */
	private setupStatusBarItem(): void {
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Auto-Expander');
	}

	/**
	 * Add editor command
	 */
	private addEditorCommand(): void {
		this.addCommand({
			id: pluginInfos.id + '-editor-command',
			name: pluginInfos.name + ' editor command',
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				log(editor.getSelection());
				editor.replaceSelection(pluginInfos.name + ' Editor Command');
			}
		});
	}

	/**
	 * Set up expansion mechanism using the expansion service
	 */
	private setupExpansionMechanism(): void {
		if (this.unregisterExpansionListener) {
			this.unregisterExpansionListener();
		}

		this.unregisterExpansionListener = this.expansionService.setupExpansionMechanism(
			this.snippetService.areSnippetsValid(),
			this.snippetService.getLastValidationError(),
			(context) => this.handleTriggerKeyPressed(context),
			(key, text, cursorIndex) => {
				let actionType: string;
				switch (key) {
					case 'Tab': actionType = 'tab'; break;
					case ' ': actionType = 'space'; break;
					case 'Enter': actionType = 'newline'; break;
					case 'Backspace': actionType = 'backspace'; break;
					default: return false;
				}
				return this.wouldTriggerSnippet(text, cursorIndex, actionType);
			}
		);
	}

	/**
	 * Register global event listeners
	 */
	private registerGlobalEvents(): void {
		// No global event listeners needed for this plugin
	}

	/**
	 * Handle trigger key presses
	 */
	private handleTriggerKeyPressed(context: TriggerContext): void {
		try {
			const triggerAction = this.expansionService.getTriggerActionFromKey(context.triggerKey);
			if (!triggerAction) return;

			const keyDetails = context.triggerKey === context.originalKey
				? context.triggerKey
				: `${context.triggerKey} (original: ${context.originalKey})`;

			log(`Trigger key pressed: ${keyDetails} (${triggerAction})`);

			// All trigger keys (Tab, Space, Enter, Backspace) are now handled by the prevention system
			// in the keyboard handler, so we can proceed normally for all of them

			this.expansionService.checkForSnippetTrigger(
				context,
				triggerAction,
				this.snippetService.getSnippetMap(),
				(trigger, isRegex) => this.snippetService.getCompiledTrigger(trigger, isRegex),
				(editor, snippet, compiledTrigger, ctx, triggerAction) =>
					this.expansionService.executeSnippet(editor, snippet, compiledTrigger, ctx, triggerAction)
			);
		} catch (error) {
			log('Error handling trigger key:', error);
		}
	}

	/**
	 * Check if a trigger action would activate any snippets at the current cursor position
	 */ 
	private wouldTriggerSnippet(text: string, cursorCharIndex: number, triggerAction: string): boolean {
		try {
			// Get snippets for this trigger action
			const actionsToCheck = new Set<string>([triggerAction]);
			if (triggerAction === 'enter') {
				actionsToCheck.add('newline');
			}
			if (triggerAction === 'newline') {
				actionsToCheck.add('enter');
			}

			const relevantSnippets: ParsedSnippet[] = [];
			const snippetMap = this.snippetService.getSnippetMap();
			for (const action of actionsToCheck) {
				const snippetsForAction = snippetMap.get(action) || [];
				for (const snippet of snippetsForAction) {
					if (!relevantSnippets.includes(snippet)) {
						relevantSnippets.push(snippet);
					}
				}
			}

			for (const snippet of relevantSnippets) {
				if (!snippet.isValid) continue;

				// Get or compile the trigger regex
				const compiledTrigger = this.snippetService.getCompiledTrigger(snippet.trigger, snippet.regex);
				if (!compiledTrigger) continue;

				// Check if this snippet matches at the current cursor position
				if (matchesTrigger(compiledTrigger, text, cursorCharIndex, triggerAction)) {
					log(`${triggerAction} would trigger snippet: ${snippet.trigger}`);
					return true;
				}
			}

			return false;
		} catch (error) {
			log('Error checking if key would trigger snippet:', error);
			return false;
		}
	}

	/**
	 * Clean up resources
	 */
	private cleanup(): void {
		if (this.unregisterExpansionListener) {
			this.unregisterExpansionListener();
			this.unregisterExpansionListener = undefined;
		}
	}

	/**
	 * Update settings and reload snippets if necessary
	 */
	async updateSettings(newSettings: Partial<AutoExpanderSettings>): Promise<void> {
		await this.settingsService.updateSettings(newSettings);
		this.settings = await this.settingsService.loadSettings();

		// Update delays if changed
		if ('commandDelay' in newSettings) {
			this.expansionService.updateCommandDelay(this.settings.commandDelay);
		}

		// Reload snippets if they might have changed
		if ('snippetsJsonc' in newSettings) {
			await this.snippetService.loadSnippets(this.settings);
			// Update expansion mechanism with new settings
			this.setupExpansionMechanism();
		}
	}

	/**
	 * Update snippet configuration
	 */
	async updateSnippets(snippetsJsonc: string): Promise<{ error?: string; invalidSnippets?: ParsedSnippet[] }> {
		await this.settingsService.setSetting('snippetsJsonc', snippetsJsonc);
		this.settings = await this.settingsService.loadSettings();
		const result = await this.snippetService.loadSnippets(this.settings);
		this.setupExpansionMechanism(); // Update expansion mechanism
		return result;
	}

	/**
	 * Get parsed snippets
	 */
	getParsedSnippets(): ParsedSnippet[] {
		return this.snippetService.getParsedSnippets();
	}

	/**
	 * Get snippet map for efficient lookup
	 */
	getSnippetMap(): Map<string, ParsedSnippet[]> {
		return this.snippetService.getSnippetMap();
	}

	/**
	 * Check if snippets are in a valid state
	 */
	areSnippetsValid(): boolean {
		return this.snippetService.areSnippetsValid();
	}

	/**
	 * Get the last validation error message
	 */
	getLastValidationError(): string | null {
		return this.snippetService.getLastValidationError();
	}

	/**
	 * Reset snippets to the last valid configuration
	 */
	async resetToLastValidSnippets(): Promise<{ error?: string }> {
		const result = await this.snippetService.resetToLastValidSnippets(this.settings);
		if (!result.error) {
			// Reload settings and update mechanism
			this.settings = await this.settingsService.loadSettings();
			this.setupExpansionMechanism();
		}
		return result;
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
		return this.snippetService.getValidationStatus();
	}
}
