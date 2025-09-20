import createDebug from 'debug';
import pluginInfos from '../../manifest.json';
import { AutoExpanderSettings, DEFAULT_SETTINGS } from '../types';

const log = createDebug(pluginInfos.id + ':settings-service');

/**
 * Service for managing plugin settings
 */
export class SettingsService {
	private plugin: { loadData(): Promise<unknown>; saveData(data: unknown): Promise<void> };
	private settings: AutoExpanderSettings;

	constructor(plugin: { loadData(): Promise<unknown>; saveData(data: unknown): Promise<void> }) {
		this.plugin = plugin;
	}

	/**
	 * Load settings from plugin data
	 */
	async loadSettings(): Promise<AutoExpanderSettings> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData());
		log('Settings loaded successfully');
		return this.settings;
	}

	/**
	 * Save current settings to plugin data
	 */
	async saveSettings(): Promise<void> {
		await this.plugin.saveData(this.settings);
		log('Settings saved successfully');
	}

	/**
	 * Get current settings
	 */
	getSettings(): AutoExpanderSettings {
		return { ...this.settings };
	}

	/**
	 * Update settings and save them
	 */
	async updateSettings(newSettings: Partial<AutoExpanderSettings>): Promise<void> {
		this.settings = { ...this.settings, ...newSettings };
		await this.saveSettings();
		log('Settings updated and saved');
	}

	/**
	 * Get specific setting value
	 */
	getSetting<K extends keyof AutoExpanderSettings>(key: K): AutoExpanderSettings[K] {
		return this.settings[key];
	}

	/**
	 * Set specific setting value and save
	 */
	async setSetting<K extends keyof AutoExpanderSettings>(key: K, value: AutoExpanderSettings[K]): Promise<void> {
		this.settings[key] = value;
		await this.saveSettings();
		log(`Setting ${key} updated to ${value}`);
	}
}
