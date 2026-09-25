import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import AutoExpander from '../main';
import { ParsedSnippet } from '../types';

export class AutoExpanderSettingTab extends PluginSettingTab {
	plugin: AutoExpander;
	private configPathInput?: HTMLInputElement;
	private statusEl?: HTMLElement;
	private errorEl?: HTMLElement;
	private successEl?: HTMLElement;
	private actionButton?: HTMLElement;
	private debounceTimer?: number;

	constructor(app: App, plugin: AutoExpander) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// Config file path setting
		const configSetting = new Setting(containerEl)
			.setName('Config file path')
			.setDesc('Path to the file containing your snippets (supports .md and .json files). The JSON can be in a code block or as plain JSON.')
			.setClass('config-path');

		// Create input field
		this.configPathInput = configSetting.controlEl.createEl('input', {
			type: 'text',
			placeholder: 'auto-expander-config.md',
			value: this.plugin.settings.configFilePath,
			cls: 'auto-expander-config-input'
		});

		// Create the action button in the same control container
		this.actionButton = configSetting.controlEl.createEl('button', {
			cls: 'mod-cta auto-expander-action-button',
			attr: { 'aria-label': 'Open the config file' }
		});

		// Status display area
		this.statusEl = containerEl.createDiv({cls: 'dotnav-path-validation'});

		// Error display
		this.errorEl = this.statusEl.createDiv({cls: 'auto-expander-error auto-expander-error-hidden'});

		// Success display
		this.successEl = this.statusEl.createDiv({cls: 'auto-expander-success auto-expander-success-hidden'});

		// Register input change handler
		this.configPathInput.addEventListener('input', (e) => {
			const target = e.target;
			if (target instanceof HTMLInputElement) {
				this.schedulePathUpdate(target.value);
			}
		});

		// Config file changes are handled automatically by the main plugin
		// listening for the 'auto-expander:config-file-changed' event

		// Command delay setting
		new Setting(containerEl)
			.setName('Command delay')
			.setDesc('Delay in milliseconds between executing commands after snippet expansion (default: 100ms). Increase if commands interfere with each other.')
			.addText(text => text
				.setPlaceholder('100')
				.setValue(this.plugin.settings.commandDelay.toString())
				.onChange(async (value) => {
					const delay = parseInt(value, 10);
					if (!isNaN(delay) && delay >= 0 && delay <= 10000) {
						await this.plugin.updateSettings({ commandDelay: delay });
					}
				}));

		// Initial validation
		void this.validateAndUpdateStatus();
	}

	/**
	 * Validate config file path and update UI accordingly
	 */
	private async validateAndUpdateStatus(): Promise<void> {
		if (!this.statusEl || !this.errorEl || !this.successEl || !this.actionButton) return;

		// Clear previous messages
		this.errorEl.addClass('auto-expander-error-hidden');
		this.errorEl.empty();
		this.successEl.addClass('auto-expander-success-hidden');
		this.successEl.empty();

		const path = this.configPathInput?.value.trim() || '';

		if (!path) {
			// No path specified - show create default option
			this.showCreateDefaultButton();
			return;
		}

		// Check if path is valid
		const status = this.plugin.configFileService.getConfigFileStatus();

		if (!status.isValid) {
			// Path is invalid - show error and create default button
			this.errorEl.empty();
			this.errorEl.appendChild(this.createValidationMessage('error', 'Config file not found'));
			this.errorEl.removeClass('auto-expander-error-hidden');
			this.showCreateDefaultButton();
			return;
		}

		// Path is valid - try to read and parse the file
		try {
			const result = await this.plugin.configFileService.readConfigFile();
			this.displayParseResult(result);
		} catch {
			this.errorEl.empty();
			this.errorEl.appendChild(this.createValidationMessage('error', 'Config file not found'));
			this.errorEl.removeClass('auto-expander-error-hidden');
			this.showCreateDefaultButton();
		}
	}

	/**
	 * Display parsing results
	 */
	private displayParseResult(result: { error?: string; invalidSnippets?: ParsedSnippet[] }): void {
		if (!this.errorEl || !this.successEl || !this.actionButton) return;

		if (result.error) {
			// Parsing error
			this.errorEl.empty();
			this.errorEl.appendChild(this.createValidationMessage('error', 'Config file not found'));
			this.errorEl.removeClass('auto-expander-error-hidden');
			this.showCreateDefaultButton();
		} else if (result.invalidSnippets && result.invalidSnippets.length > 0) {
			// Validation errors
			this.errorEl.empty();
			this.errorEl.appendChild(this.createValidationMessage('error', 'Config file not found'));
			this.errorEl.removeClass('auto-expander-error-hidden');
			this.showCreateDefaultButton();
		} else {
			// Success
			const snippetCount = this.plugin.getParsedSnippets().length;
			if (snippetCount > 0) {
				this.successEl.empty();
				this.successEl.appendChild(this.createValidationMessage('success', 'Config file found'));
				this.successEl.removeClass('auto-expander-success-hidden');
			}
			this.showOpenFileButton();
		}
	}

	/**
	 * Create a validation message element
	 */
	private createValidationMessage(type: 'success' | 'error', message: string): HTMLElement {
		const messageEl = createDiv({cls: `dotnav-validation-message dotnav-validation-${type}`});

		const iconSpan = createSpan({cls: 'dotnav-validation-icon'});
		iconSpan.textContent = type === 'success' ? '✓' : '✗';

		const textSpan = createSpan();
		textSpan.textContent = message;

		messageEl.appendChild(iconSpan);
		messageEl.appendChild(textSpan);

		return messageEl;
	}

	/**
	 * Show "Open File" button
	 */
	private showOpenFileButton(): void {
		if (!this.actionButton) return;

		this.actionButton.textContent = 'Open file';
		this.actionButton.onclick = async () => {
			await this.plugin.configFileService.openConfigFile();
		};
	}

	/**
	 * Show "Create Default File" button
	 */
	private showCreateDefaultButton(): void {
		if (!this.actionButton) return;

		this.actionButton.textContent = 'Create default file';
		this.actionButton.onclick = async () => {
			const result = await this.plugin.configFileService.createDefaultConfigFile();
			if (result.success) {
				new Notice('Default config file created successfully');
				// Update the input field
				if (this.configPathInput) {
					this.configPathInput.value = 'auto-expander-config.md';
					this.schedulePathUpdate('auto-expander-config.md');
				}
			} else {
				new Notice(`Failed to create default config file: ${result.error}`);
			}
		};
	}

	/**
	 * Schedule a debounced path update
	 */
	private schedulePathUpdate(path: string): void {
		if (this.debounceTimer !== undefined) {
			window.clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = window.setTimeout(() => {
			void this.updateConfigPath(path);
			this.debounceTimer = undefined;
		}, 500);
	}

	/**
	 * Update the config file path in settings
	 */
	private async updateConfigPath(path: string): Promise<void> {
		await this.plugin.updateSettings({ configFilePath: path });
		await this.validateAndUpdateStatus();
	}


	// Override hide method for proper cleanup
	hide(): void {
		// Clear debounce timer
		if (this.debounceTimer !== undefined) {
			window.clearTimeout(this.debounceTimer);
			this.debounceTimer = undefined;
		}

		super.hide();
	}
}
