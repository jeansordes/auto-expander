import { TFile, Notice, App } from 'obsidian';
import createDebug from 'debug';
import pluginInfos from '../../manifest.json';
import { parseJsoncSnippets } from '../snippet-utils';
import type { Snippet } from '../types';

/**
 * Internal Obsidian API interface for accessing settings
 */
interface ObsidianInternalApp extends App {
  setting?: {
    close(): void;
  };
}

const log = createDebug(pluginInfos.id + ':config-file-service');

/**
 * Service for managing config file operations
 */
export class ConfigFileService {
	private app: App;
	private configFilePath: string = '';
	private configFile: TFile | undefined;
	private fileChangeDebounceTimer?: number;
	private fileRenameEventRef?: Parameters<typeof this.app.vault.offref>[0];
	private fileChangeEventRef?: Parameters<typeof this.app.vault.offref>[0];

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Set the config file path and register file watchers
	 */
	setConfigFilePath(configFilePath: string): void {
		// Clean up existing watchers
		this.cleanup();

		this.configFilePath = configFilePath;
		this.configFile = this.getFileFromPath(configFilePath);

		// Register new watchers if path is valid
		if (this.configFile) {
			this.registerFileWatchers();
		}
	}

	/**
	 * Get the current config file path
	 */
	getConfigFilePath(): string {
		return this.configFilePath;
	}

	/**
	 * Check if the config file path is valid
	 */
	isConfigFilePathValid(): boolean {
		return !!this.configFile && this.configFile instanceof TFile;
	}

	/**
	 * Get validation status for the config file path
	 */
	getConfigFileStatus(): { isValid: boolean; error?: string } {
		if (!this.configFilePath.trim()) {
			return { isValid: true }; // Empty path is valid (no config file)
		}

		if (!this.configFile) {
			return { isValid: false, error: `File not found: ${this.configFilePath}` };
		}

		if (!(this.configFile instanceof TFile)) {
			return { isValid: false, error: `Path is not a file: ${this.configFilePath}` };
		}

		return { isValid: true };
	}

	/**
	 * Read and parse the config file with retry logic
	 */
	async readConfigFile(maxRetries: number = 3): Promise<{ snippets: Snippet[]; error?: string }> {
		if (!this.isConfigFilePathValid()) {
			return { snippets: [] };
		}

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const content = await this.app.vault.read(this.configFile!);
				const jsonContent = this.extractJsonFromFile(content);
				return parseJsoncSnippets(jsonContent);
			} catch (error) {
				log(`Error reading config file (attempt ${attempt}/${maxRetries}):`, error);

				// If this is not the last attempt, wait a bit before retrying
				if (attempt < maxRetries) {
					await new Promise(resolve => setTimeout(resolve, 100 * attempt)); // Progressive delay
				} else {
					// Last attempt failed
					return {
						snippets: [],
						error: `Failed to read config file after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
					};
				}
			}
		}

		// This should never be reached, but TypeScript needs it
		return { snippets: [] };
	}

	/**
	 * Create a default config file
	 */
	async createDefaultConfigFile(): Promise<{ success: boolean; error?: string }> {
		const defaultPath = 'auto-expander-config.md';

		try {
			// Check if file already exists
			const existingFile = this.app.vault.getAbstractFileByPath(defaultPath);
			if (existingFile) {
				return { success: false, error: `File already exists: ${defaultPath}` };
			}

			// Create default content with frontmatter and JSON in code block
			const defaultContent = `---
auto-expander-config: true
---

\`\`\`json
[
  {
    "trigger": "hello\${0:space}",
    "replacement": "Hello, World!",
    "commands": ["editor:focus"]
  }
]
\`\`\`
`;

			await this.app.vault.create(defaultPath, defaultContent);
			log(`Created default config file: ${defaultPath}`);
			return { success: true };
		} catch (error) {
			log('Error creating default config file:', error);
			return {
				success: false,
				error: `Failed to create config file: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	/**
	 * Open the config file in the editor and close settings
	 */
	async openConfigFile(): Promise<void> {
		if (!this.isConfigFilePathValid()) {
			new Notice('No valid config file to open');
			return;
		}

		try {
			// Close settings modal first
			const obsidianApp: ObsidianInternalApp = this.app;
			if (obsidianApp.setting) {
				obsidianApp.setting.close();
			}

			// Open file in a new tab
			await this.app.workspace.getLeaf().openFile(this.configFile!);
		} catch (error) {
			log('Error opening config file:', error);
			new Notice('Failed to open config file');
		}
	}

	/**
	 * Extract JSON content from file (handles frontmatter and code blocks)
	 */
	private extractJsonFromFile(content: string): string {
		// Remove frontmatter if present
		const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
		const cleanedContent = content.replace(frontmatterRegex, '');

		// Look for JSON code blocks
		const codeBlockRegex = /```(?:json|JSON)?\n([\s\S]*?)\n```/;
		const match = cleanedContent.match(codeBlockRegex);

		if (match) {
			return match[1].trim();
		}

		// If no code block found, try to find the first valid JSON object/array
		const jsonRegex = /(\[[\s\S]*\]|\{[\s\S]*\})/;
		const jsonMatch = cleanedContent.match(jsonRegex);

		if (jsonMatch) {
			return jsonMatch[1].trim();
		}

		// Fallback to entire content
		return cleanedContent.trim();
	}

	/**
	 * Get TFile from path string
	 */
	private getFileFromPath(path: string): TFile | undefined {
		if (!path.trim()) {
			return undefined;
		}

		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : undefined;
	}

	/**
	 * Register file watchers for rename and change events
	 */
	private registerFileWatchers(): void {
		if (!this.configFile) return;

		// Watch for file changes with debouncing
		this.fileChangeEventRef = this.app.vault.on('modify', (file) => {
			if (file.path === this.configFile?.path) {
				this.onConfigFileChanged();
			}
		});

		// Watch for file renames
		this.fileRenameEventRef = this.app.vault.on('rename', (file, oldPath) => {
			if (oldPath === this.configFile?.path && file instanceof TFile) {
				this.onConfigFileRenamed(file);
			}
		});
	}

	/**
	 * Handle config file changes with debouncing
	 */
	private onConfigFileChanged(): void {
		if (this.fileChangeDebounceTimer) {
			clearTimeout(this.fileChangeDebounceTimer);
		}

		this.fileChangeDebounceTimer = window.setTimeout(() => {
			log('Config file changed, reloading...');
			// Emit event for subscribers to handle
			this.app.workspace.trigger('auto-expander:config-file-changed');
			this.fileChangeDebounceTimer = undefined;
		}, 300);
	}

	/**
	 * Handle config file renames
	 */
	private onConfigFileRenamed(newFile: TFile): void {
		const oldPath = this.configFilePath;
		this.configFilePath = newFile.path;
		this.configFile = newFile;

		log(`Config file renamed from ${oldPath} to ${newFile.path}`);
		new Notice(`Auto Expander: Config file renamed to ${newFile.path}`);

		// Emit event for settings to update
		this.app.workspace.trigger('auto-expander:config-file-renamed', newFile.path);
	}

	/**
	 * Clean up event listeners and timers
	 */
	cleanup(): void {
		if (this.fileChangeEventRef) {
			this.app.vault.offref(this.fileChangeEventRef);
			this.fileChangeEventRef = undefined;
		}

		if (this.fileRenameEventRef) {
			this.app.vault.offref(this.fileRenameEventRef);
			this.fileRenameEventRef = undefined;
		}

		if (this.fileChangeDebounceTimer) {
			clearTimeout(this.fileChangeDebounceTimer);
			this.fileChangeDebounceTimer = undefined;
		}
	}
}
