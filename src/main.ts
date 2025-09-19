import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import createDebug from 'debug';
import pluginInfos from '../manifest.json';

const log = createDebug(pluginInfos.id + ':main');

// Remember to rename these classes and interfaces!

interface AutoExpanderSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: AutoExpanderSettings = {
	mySetting: 'default'
}

export default class AutoExpander extends Plugin {
	settings: AutoExpanderSettings;

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

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', pluginInfos.name, (_evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-' + pluginInfos.id + '-modal-simple',
			name: 'Open ' + pluginInfos.name + ' modal (simple)',
			callback: () => {
				new AutoExpanderModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: pluginInfos.id + '-editor-command',
			name: pluginInfos.name + ' editor command',
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				log(editor.getSelection());
				editor.replaceSelection(pluginInfos.name + ' Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-' + pluginInfos.id + '-modal-complex',
			name: 'Open ' + pluginInfos.name + ' modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new AutoExpanderModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
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
}

class AutoExpanderModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class AutoExpanderSettingTab extends PluginSettingTab {
	plugin: AutoExpander;

	constructor(app: App, plugin: AutoExpander) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
