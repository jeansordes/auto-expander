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
	private debounceTimer?: number;

	constructor(app: App, plugin: AutoExpander) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const {containerEl} = this;

		// Only destroy editor if container is being emptied, otherwise preserve state
		if (containerEl.children.length > 0) {
			this.snippetEditor?.destroy();
			this.snippetEditor = undefined;
		}

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Auto Expander Settings'});

		// Wrapper for full-width textarea
		const textareaWrapper = containerEl.createEl('div', {cls: 'auto-expander-textarea-wrapper'});

		const snippetSetting = new Setting(textareaWrapper)
			.setName('Snippets (JSONC)')
			.setDesc('Define your text expansion snippets in JSONC format. Supports comments and flexible syntax.');
			
		// Status display (right above the editor)
		const statusEl = snippetSetting.controlEl.createEl('div', {cls: 'auto-expander-status'});

		const editorContainer = snippetSetting.controlEl.createDiv({cls: 'auto-expander-editor'});

		// Error display
		const errorEl = statusEl.createEl('div', {cls: 'auto-expander-error auto-expander-error-hidden'});
		const errorContent = errorEl.createEl('div', {cls: 'auto-expander-error-content'});

		// Success display
		const successEl = statusEl.createEl('div', {cls: 'auto-expander-success auto-expander-success-hidden'});
		const successContent = successEl.createEl('div', {cls: 'auto-expander-success-content'});

		const placeholder = '[\n  {\n    "trigger": "hello\\${0:space}",\n    "replacement": "Hello, World!",\n    "commands": ["editor:focus"]\n  }';

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
			errorEl.addClass('auto-expander-error-hidden');
			errorContent.empty();
			successEl.addClass('auto-expander-success-hidden');
			successContent.empty();

			if (result.error) {
				errorContent.createEl('div', {cls: 'auto-expander-error-title', text: 'JSONC Error'});
				errorContent.createEl('div', {cls: 'auto-expander-error-message', text: result.error});
				errorEl.removeClass('auto-expander-error-hidden');
			} else if (result.invalidSnippets && result.invalidSnippets.length > 0) {
				errorContent.createEl('div', {cls: 'auto-expander-error-title', text: 'Validation Errors'});
				const errorList = errorContent.createEl('div', {cls: 'auto-expander-error-list'});
				result.invalidSnippets.forEach((snippet) => {
					const originalIndex = this.plugin.getParsedSnippets().indexOf(snippet);
					errorList.createEl('div', {
						cls: 'auto-expander-error-item',
						text: `Snippet ${originalIndex + 1}: ${snippet.error || 'Validation error'}`
					});
				});
				errorEl.removeClass('auto-expander-error-hidden');
			} else {
				const snippetCount = this.plugin.getParsedSnippets().length;
				if (snippetCount > 0) {
					successContent.createEl('div', {cls: 'auto-expander-success-title', text: 'Success'});
					successContent.createEl('div', {cls: 'auto-expander-success-message', text: `Successfully loaded ${snippetCount} snippet${snippetCount === 1 ? '' : 's'}`});
					successEl.removeClass('auto-expander-success-hidden');
				}
			}
		};

		const applySnippetUpdate = async (value: string) => {
			const result = await this.plugin.updateSnippets(value);
			renderResult(result);
		};

		const scheduleUpdate = (value: string) => {
			if (this.debounceTimer !== undefined) {
				window.clearTimeout(this.debounceTimer);
			}
			this.debounceTimer = window.setTimeout(() => {
				void applySnippetUpdate(value);
				this.debounceTimer = undefined; // Clear reference after execution
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

		const createEditorState = (wrapText: boolean) => EditorState.create({
			doc: this.plugin.settings.snippetsJsonc,
			extensions: [
				json(),
				...(wrapText ? [EditorView.lineWrapping] : []),
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

		const state = createEditorState(this.plugin.settings.wrapText);

		try {
			this.snippetEditor = new EditorView({
				state,
				parent: editorContainer,
			});
		} catch (error) {
			console.error('Failed to create CodeMirror editor:', error);
			// Fallback to a simple textarea if CodeMirror fails
			const textarea = editorContainer.createEl('textarea', {
				cls: 'auto-expander-fallback-textarea',
				attr: { placeholder: placeholder, rows: 10 }
			});
			textarea.value = this.plugin.settings.snippetsJsonc;
			textarea.addEventListener('input', (e) => {
				const target = e.target;
				if (target instanceof HTMLTextAreaElement) {
					scheduleUpdate(target.value);
				}
			});
			return;
		}

		// Text wrapping toggle
		new Setting(containerEl)
			.setName('Wrap text in editor')
			.setDesc('Enable text wrapping in the snippets editor. When disabled, text will scroll horizontally.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.wrapText)
				.onChange(async (value) => {
					await this.plugin.updateSettings({ wrapText: value });
					// Recreate editor with new wrapping setting
					if (this.snippetEditor) {
						const newState = createEditorState(value);
						this.snippetEditor.setState(newState);
					}
				}));

		// Command delay setting
		new Setting(containerEl)
			.setName('Command Delay')
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

		// Initial status update
		const initialResult = await this.plugin.updateSnippets(this.plugin.settings.snippetsJsonc);
		renderResult(initialResult);
	}

	// Override hide method for proper cleanup
	hide(): void {
		// Clear any pending debounced updates
		if (this.snippetEditor) {
			// Ensure any pending updates are processed before hiding
			const currentDoc = this.snippetEditor.state.doc.toString();
			if (currentDoc !== this.plugin.settings.snippetsJsonc) {
				void this.plugin.updateSnippets(currentDoc);
			}
		}

		// Clear debounce timer
		if (this.debounceTimer !== undefined) {
			window.clearTimeout(this.debounceTimer);
			this.debounceTimer = undefined;
		}

		super.hide();
	}
}
