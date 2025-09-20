import { App, PluginSettingTab, Setting } from 'obsidian';
import { indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, ViewUpdate, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import AutoExpander from '../main';
import { ParsedSnippet } from '../types';

export class AutoExpanderSettingTab extends PluginSettingTab {
	plugin: AutoExpander;
	private snippetEditor?: EditorView;

	constructor(app: App, plugin: AutoExpander) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const {containerEl} = this;
		this.snippetEditor?.destroy();
		this.snippetEditor = undefined;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Auto Expander Settings'});

		new Setting(containerEl)
			.setName('Enable Plugin')
			.setDesc('Toggle the auto expansion functionality')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enabled)
				.onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', {text: 'Snippets Configuration'});

		// Error display
		const errorEl = containerEl.createEl('div', {cls: 'setting-item'});
		const errorDesc = errorEl.createEl('div', {cls: 'setting-item-description auto-expander-error auto-expander-error-hidden'});

		// Success display
		const successEl = containerEl.createEl('div', {cls: 'setting-item'});
		const successDesc = successEl.createEl('div', {cls: 'setting-item-description auto-expander-success auto-expander-success-hidden'});

		// Wrapper for full-width textarea
		const textareaWrapper = containerEl.createEl('div', {cls: 'auto-expander-textarea-wrapper'});

		const snippetSetting = new Setting(textareaWrapper)
			.setName('Snippets (JSONC)')
			.setDesc('Define your text expansion snippets in JSONC format. Supports comments and flexible syntax.');

		const editorContainer = snippetSetting.controlEl.createDiv({cls: 'auto-expander-editor'});
		const placeholder = '[\n  {\n    "trigger": "hello\\${0:space}",\n    "replacement": "Hello, World!",\n    "commands": ["editor:focus"]\n  }\n]';
		let debounceTimer: number | undefined;

		const jsonHighlightStyle = HighlightStyle.define([
			{ tag: tags.string, color: 'var(--code-string, #a8ff60)' },
			{ tag: tags.number, color: 'var(--code-number, #ffd866)' },
			{ tag: tags.bool, color: 'var(--code-boolean, #ff6188)' },
			{ tag: tags.null, color: 'var(--code-null, #ff6188)' },
			{ tag: tags.propertyName, color: 'var(--code-property, #78dce8)' },
			{ tag: tags.brace, color: 'var(--code-punctuation, var(--text-normal))' },
			{ tag: tags.bracket, color: 'var(--code-punctuation, var(--text-normal))' },
			{ tag: tags.operator, color: 'var(--code-operator, var(--text-normal))' },
			{ tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--code-comment, var(--text-muted))', fontStyle: 'italic' },
		]);

		const renderResult = (result: { error?: string; invalidSnippets?: ParsedSnippet[] }) => {
			// Clear previous messages
			errorDesc.addClass('auto-expander-error-hidden');
			errorDesc.textContent = '';
			successDesc.addClass('auto-expander-success-hidden');
			successDesc.textContent = '';

			if (result.error) {
				errorDesc.textContent = `❌ JSONC Error: ${result.error}`;
				errorDesc.removeClass('auto-expander-error-hidden');
			} else if (result.invalidSnippets && result.invalidSnippets.length > 0) {
				const errorMessages = result.invalidSnippets
					.map((snippet) => {
						const originalIndex = this.plugin.getParsedSnippets().indexOf(snippet);
						return `Snippet ${originalIndex + 1}: ${snippet.error || 'Validation error'}`;
					})
					.join('\n');
				errorDesc.textContent = `⚠️ Validation Errors:\n${errorMessages}`;
				errorDesc.removeClass('auto-expander-error-hidden');
			} else {
				const snippetCount = this.plugin.getParsedSnippets().length;
				if (snippetCount > 0) {
					successDesc.textContent = `✅ Successfully loaded ${snippetCount} snippet${snippetCount === 1 ? '' : 's'}`;
					successDesc.removeClass('auto-expander-success-hidden');
				}
			}
		};

		const applySnippetUpdate = async (value: string) => {
			const result = await this.plugin.updateSnippets(value);
			renderResult(result);
			updateStatus();
		};

		const scheduleUpdate = (value: string) => {
			if (debounceTimer !== undefined) {
				window.clearTimeout(debounceTimer);
			}
			debounceTimer = window.setTimeout(() => {
				void applySnippetUpdate(value);
			}, 300);
		};

		const commentDecoration = Decoration.mark({ class: 'cm-jsonc-comment' });

		const buildCommentDecorations = (view: EditorView) => {
			const builder = new RangeSetBuilder<Decoration>();
			const text = view.state.doc.toString();
			let pos = 0;
			let inString = false;
			let escapeNext = false;
			let blockStart: number | null = null;

			while (pos < text.length) {
				const ch = text[pos];
				const next = text[pos + 1];

				if (blockStart !== null) {
					if (ch === '*' && next === '/') {
						builder.add(blockStart, pos + 2, commentDecoration);
						blockStart = null;
						pos += 2;
						continue;
					}
					pos += 1;
					continue;
				}

				if (inString) {
					if (escapeNext) {
						escapeNext = false;
						pos += 1;
						continue;
					}
					if (ch === '\\') {
						escapeNext = true;
						pos += 1;
						continue;
					}
					if (ch === '"') {
						inString = false;
					}
					pos += 1;
					continue;
				}

				if (ch === '"') {
					inString = true;
					pos += 1;
					continue;
				}

				if (ch === '/' && next === '*') {
					blockStart = pos;
					pos += 2;
					continue;
				}

				if (ch === '/' && next === '/') {
					const start = pos;
					pos += 2;
					while (pos < text.length && text[pos] !== '\n') {
						pos += 1;
					}
					builder.add(start, pos, commentDecoration);
					continue;
				}

				pos += 1;
			}

			if (blockStart !== null) {
				builder.add(blockStart, text.length, commentDecoration);
			}

			return builder.finish();
		};

		const commentHighlightPlugin = ViewPlugin.fromClass(class {
			decorations;

			constructor(view: EditorView) {
				this.decorations = buildCommentDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged) {
					this.decorations = buildCommentDecorations(update.view);
				}
			}
		}, {
			decorations: (value) => value.decorations
		});

		const state = EditorState.create({
			doc: this.plugin.settings.snippetsJsonc,
			extensions: [
				json(),
				EditorView.lineWrapping,
				keymap.of([indentWithTab]),
				cmPlaceholder(placeholder),
				syntaxHighlighting(jsonHighlightStyle, {fallback: true}),
				commentHighlightPlugin,
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						scheduleUpdate(update.state.doc.toString());
					}
				}),
			]
		});

		this.snippetEditor = new EditorView({
			state,
			parent: editorContainer,
		});

		// Status information
		const statusEl = containerEl.createEl('div', {cls: 'setting-item'});
		statusEl.createEl('div', {cls: 'setting-item-name', text: 'Status'});
		const statusDesc = statusEl.createEl('div', {cls: 'setting-item-description'});

		const updateStatus = () => {
			const snippets = this.plugin.getParsedSnippets();
			const validCount = snippets.filter((s) => s.isValid).length;
			const invalidCount = snippets.length - validCount;

			if (snippets.length === 0) {
				statusDesc.setText('No snippets configured');
			} else if (invalidCount === 0) {
				statusDesc.setText(`${validCount} snippet(s) loaded successfully`);
			} else {
				statusDesc.setText(`${validCount} valid, ${invalidCount} invalid snippet(s)`);
			}
		};

		// Initial status update
		const initialResult = await this.plugin.updateSnippets(this.plugin.settings.snippetsJsonc);
		renderResult(initialResult);
		updateStatus();
	}
}
