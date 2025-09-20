# Auto Expander Plugin - Technical Specifications

## 1. Overview

The Auto Expander plugin streamlines writing in Obsidian by expanding user-defined snippets into longer phrases or templates in real-time. It supports desktop and mobile, reducing repetitive typing and standardizing content.

- [ ] TODO: [#1](https://github.com/jeansordes/auto-expander/issues/1) Write introductory documentation for plugin usage.
- [ ] TODO: [#2](https://github.com/jeansordes/auto-expander/issues/2) Ensure plugin works seamlessly on both desktop and mobile.
- [ ] TODO: [#3](https://github.com/jeansordes/auto-expander/issues/3) Test real-time expansion performance and UX.

## 2. Data Model

- Snippets are defined as JSONC objects with these fields:
  - `trigger` (string): Text used to trigger expansion.
  - `replacement` (optional) (string | string[]): String or array of strings representing the replacement lines.
  - `commands` (optional) (string | string[]): List of command IDs to execute after expansion.

- Triggers include cursor markers with options (e.g., `${0:instant,space}`) specifying when expansions occur.

- Snippets are stored in a map keyed by trigger action (e.g., "instant", "space", "tab"), allowing multiple triggers per snippet.

- [ ] TODO: [#4](https://github.com/jeansordes/auto-expander/issues/4) Implement parsing of trigger, replacement, and commands fields from JSONC.
- [ ] TODO: [#5](https://github.com/jeansordes/auto-expander/issues/5) Map snippets by trigger action for efficient lookup.
- [ ] TODO: [#6](https://github.com/jeansordes/auto-expander/issues/6) Support cursor marker option parsing in triggers.
- [ ] TODO: [#7](https://github.com/jeansordes/auto-expander/issues/7) Store and retrieve snippet data from plugin storage.

## 3. Validation Rules

- Snippet strings must be valid JSONC.
- Duplicate triggers within the snippet configuration are not allowed.
- On invalid snippet data:
  - Display a warning.
  - Save the snippet but enter an error state until fixed.
- On valid snippet data:
  - Display a success message.
  - Save the snippet and parse it for runtime use.
- Users can reset snippets to the last valid configuration.

- [ ] TODO: [#8](https://github.com/jeansordes/auto-expander/issues/8) Add JSONC parser and error handling for invalid/duplicate triggers.
- [ ] TODO: [#9](https://github.com/jeansordes/auto-expander/issues/9) Implement warning and success message display.
- [ ] TODO: [#10](https://github.com/jeansordes/auto-expander/issues/10) Allow user to reset to last valid snippet configuration.
- [ ] TODO: [#11](https://github.com/jeansordes/auto-expander/issues/11) Prevent expansion if validation fails (error state).

## 4. Expansion Flow

1. Listen to all keystrokes and editor actions (typing, key presses, deletions).
2. On each event:
   - Capture the editor state **before** the modification.
   - Detect if the event matches any snippet trigger based on the trigger action and cursor position.
3. If a snippet trigger is activated:
   - Insert the replacement text.
   - Execute associated commands sequentially with a configurable delay (default 100ms).
   - If a command fails, show a warning but continue processing.
4. Do not trigger expansions if text is selected.

- [ ] TODO: [#12](https://github.com/jeansordes/auto-expander/issues/12) Listen for all relevant keystrokes and editor actions.
- [ ] TODO: [#13](https://github.com/jeansordes/auto-expander/issues/13) Capture editor state before and after modification.
- [ ] TODO: [#14](https://github.com/jeansordes/auto-expander/issues/14) Detect and match snippet triggers on events.
- [ ] TODO: [#15](https://github.com/jeansordes/auto-expander/issues/15) Insert replacement text and execute commands with delay.
- [ ] TODO: [#16](https://github.com/jeansordes/auto-expander/issues/16) Show warning on command failure but continue.
- [ ] TODO: [#17](https://github.com/jeansordes/auto-expander/issues/17) Block expansion if any text is selected.

## 5. Cursor Markers

- Syntax examples:
  - `$0`
  - `${0}`
  - `${0:space}`
  - `${0:space,tab,instant,backspace}` (comma-separated options)
- Regex to find cursor marker:  
  `\$\{?0(?::([^}]+))?\}?`  
- Supports flexible spacing and option lists.

- [ ] TODO: [#18](https://github.com/jeansordes/auto-expander/issues/18) Implement regex to parse cursor markers and extract options.
- [ ] TODO: [#19](https://github.com/jeansordes/auto-expander/issues/19) Support various cursor marker syntaxes in triggers.
- [ ] TODO: [#20](https://github.com/jeansordes/auto-expander/issues/20) Allow flexible option lists and whitespace handling.

## 6. Regex Mechanism

**Pipeline for parsing and matching triggers:**

1. **Extract options list** from cursor marker (e.g., `["space","tab","instant","backspace"]`).
2. **Replace cursor marker with zero-width named group** `(?<CURSOR>)` in the regex pattern.
3. **Compile final regex** with `/d` flag for indices support.
4. **Match input string** against regex.
5. **Verify cursor alignment** by comparing `m.indices.groups.CURSOR[0]` with the editor cursor position.
6. **Check event type** against allowed options.

**Example Trigger:**

```js
const trigger = "ab(c${0:space,tab}d)+e";
```

**Example Parsed Regex:**

```js
const compileTrigger = trigger => {
  const m = /\$\{?0(?::([^}]+))?\}?/.exec(trigger);
  if (!m) throw new Error("Trigger must contain a cursor marker");

  return {
    regex: new RegExp(trigger.replace(/\$\{?0(?::([^}]+))?\}?/, "(?<CURSOR>)"), "d"),
    options: m[1] ? m[1].split(",").map(s => s.trim()) : []
  };
};
```

**Example Match Flow:**

```js
const matchesTrigger = (trigger, input, cursorPos, eventType) => {
  const { regex, options } = compileTrigger(trigger);
  const m = regex.exec(input);
  return m?.indices.groups?.CURSOR?.[0] === cursorPos &&
         (!options.length || options.includes(eventType));
};

const input = "abcdcde";
const cursorPos = 4;
console.log(matchesTrigger(trigger, input, cursorPos, "space")); // → true

- [ ] TODO: [#21](https://github.com/jeansordes/auto-expander/issues/21) Extract options from cursor marker in trigger string.
- [ ] TODO: [#22](https://github.com/jeansordes/auto-expander/issues/22) Replace cursor marker with `(?<CURSOR>)` in regex pattern.
- [ ] TODO: [#23](https://github.com/jeansordes/auto-expander/issues/23) Compile regex with `/d` flag and match input.
- [ ] TODO: [#24](https://github.com/jeansordes/auto-expander/issues/24) Check cursor alignment and event type for trigger activation.
```

## 7. Non-Regex Handling

- Non-regex snippets treat the trigger string as literal text.
- Special regex characters are escaped to unify parsing with regex snippets.
- If the trigger string is already a regex (starts and ends with `/`), it is used directly.

**Behavior:**

| Snippet Type | Parsing Behavior                             |
|--------------|----------------------------------------------|
| Regex        | Used as-is with cursor marker replaced       |
| Non-regex    | Escaped and converted to regex for matching  |

**Example:**

```js
const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseSearchString = searchString => {
  if (searchString.startsWith('/') && searchString.endsWith('/')) {
    const pattern = searchString.slice(1, -1);
    return new RegExp(pattern, 'gi');
  }
  return new RegExp(escapeRegex(searchString), 'gi');
};

- [ ] TODO: [#25](https://github.com/jeansordes/auto-expander/issues/25) Escape special regex characters for non-regex triggers.
- [ ] TODO: [#26](https://github.com/jeansordes/auto-expander/issues/26) Detect and use regex triggers directly if formatted as regex.
- [ ] TODO: [#27](https://github.com/jeansordes/auto-expander/issues/27) Unify matching logic for regex and non-regex snippets.
```

## 8. Edge Cases & Errors

- Expansion is blocked if any text is selected in the editor.
- If a command fails during execution, a warning is shown but the expansion proceeds.
- The plugin maintains an error state if snippet validation fails, preventing expansions until fixed.

- [ ] TODO: [#28](https://github.com/jeansordes/auto-expander/issues/28) Prevent expansion when text is selected.
- [ ] TODO: [#29](https://github.com/jeansordes/auto-expander/issues/29) Show warning if a command fails during expansion.
- [ ] TODO: [#30](https://github.com/jeansordes/auto-expander/issues/30) Maintain error state and block expansions on validation failure.

---

## How to get the text before the modification happened (non-blocking)

```js
const setupTriggerKeyListeners = (editor, triggerKeys, callback) => {
  const keydownHandler = (event) => {
    if (triggerKeys.includes(event.key)) {
      const beforeText = editor.getValue();
      const beforeCursor = editor.getCursor();

      setTimeout(() => {
        const afterText = editor.getValue();
        const afterCursor = editor.getCursor();

        callback({
          triggerKey: event.key,
          beforeText,
          beforeCursor,
          afterText,
          afterCursor,
          deletedChar: event.key === 'Backspace' ? beforeText[beforeCursor.ch - 1] : null
        });
      }, 0);
    }
  };

  return keydownHandler;
};
```

**Usage in Obsidian plugin:**

```js
export default class AutoExpander extends Plugin {
  async onload() {
    const triggerKeys = ['Backspace', 'Enter', ' ', 'Tab'];

    const triggerHandler = setupTriggerKeyListeners(
      this.app.workspace.getActiveViewOfType(MarkdownView)?.editor,
      triggerKeys,
      (context) => {
        console.log(`Snippet triggered by: ${context.triggerKey}`);
        console.log(`Text before: "${context.beforeText}"`);
        console.log(`Text after: "${context.afterText}"`);

        this.checkForSnippetTrigger(context);
      }
    );

    this.registerDomEvent(document, 'keydown', (event) => {
      const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
      if (editor) {
        triggerHandler(event);
      }
    });
  }

  private checkForSnippetTrigger(context) {
    // Implement snippet expansion logic using context data
  }
}

- [ ] TODO: [#31](https://github.com/jeansordes/auto-expander/issues/31) Integrate key event context capture into expansion flow.
- [ ] TODO: [#32](https://github.com/jeansordes/auto-expander/issues/32) Use before/after text and cursor data for accurate trigger detection.
```
