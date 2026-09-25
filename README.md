# Auto Expander

Auto Expander replaces short triggers with reusable text snippets while you type. It works on desktop and mobile, supports literal and regular-expression triggers, and can run Obsidian commands after an expansion.

## Features

- Expand snippets instantly or after pressing Space, Tab, Enter, or Backspace.
- Use literal triggers or regular expressions.
- Place the cursor anywhere in the replacement with `$0`.
- Reuse regular-expression capture groups such as `$1` in replacements.
- Run one or more Obsidian commands after an expansion.
- Keep snippets in a JSONC configuration file inside your vault.
- Reload snippets automatically when the configuration file changes.

## Installation

### Community plugins

Once Auto Expander is listed in the Community plugins directory:

1. Open **Settings → Community plugins**.
2. Select **Browse** and search for **Auto Expander**.
3. Select **Install**, then **Enable**.

### BRAT

Until the community listing is available, install Auto Expander with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable BRAT.
2. In BRAT settings, select **Add Beta plugin**.
3. Enter `https://github.com/jeansordes/auto-expander`.

## Getting started

1. Open **Settings → Auto Expander**.
2. Select **Create default file**. The plugin creates `auto-expander-config.md` in the root of your vault.
3. Edit the JSONC array in that file and save it. Changes are loaded automatically.

A minimal configuration looks like this:

```jsonc
[
  {
    // Expands immediately after typing "btw".
    "trigger": "btw${0:instant}",
    "replacement": "By the way$0"
  },
  {
    // Expands when Space is pressed after "addr".
    "trigger": "addr${0:space}",
    "replacement": [
      "123 Example Street",
      "Paris, France$0"
    ]
  }
]
```

The configuration can be a `.md` or `.json` file. In a Markdown file, place the array in a `json` code block. JSONC comments and trailing commas are supported.

## Snippet format

Each snippet accepts the following fields:

| Field | Required | Description |
| --- | --- | --- |
| `trigger` | Yes | Literal text or a regular expression wrapped in `/.../`. Add a cursor marker to select the activation method. |
| `replacement` | No | A string or array of lines to insert. Use `$0` for the final cursor position. |
| `commands` | No | An Obsidian command ID or array of command IDs to run after replacement. |

### Activation methods

Add one or more activation methods to the trigger's cursor marker:

- `${0:instant}` — expand as soon as the trigger is typed.
- `${0:space}` — expand when Space is pressed.
- `${0:tab}` — expand when Tab is pressed.
- `${0:newline}` or `${0:enter}` — expand when Enter is pressed.
- `${0:backspace}` — expand when Backspace is pressed.

Multiple methods can be combined, for example `${0:space,tab}`. A literal trigger without a cursor marker expands instantly.

### Regular-expression triggers

Wrap a trigger in forward slashes to treat it as a regular expression:

```jsonc
[
  {
    "trigger": "/Hello, (.+)${0:newline}/",
    "replacement": "Welcome, $1!$0"
  }
]
```

Regular expressions run locally against the editor content. Avoid patterns with catastrophic backtracking; Auto Expander stops long-running matching attempts and shows a notice.

### Running commands

Use command IDs from Obsidian or another installed plugin:

```jsonc
[
  {
    "trigger": "/today${0:instant}",
    "replacement": "<% tp.date.now(\"YYYY-MM-DD\") %>$0",
    "commands": "templater-obsidian:replace-in-file-templater"
  }
]
```

The **Command delay** setting controls the delay between multiple commands.

## Privacy

Auto Expander works entirely inside your vault. It does not make network requests, collect telemetry, or access files outside the vault.

## Development

Requirements: Node.js 18 or later and npm.

```bash
npm install
npm run ci
```

Use `npm run dev` for a watch build. Production releases are built with `npm run build` and include `main.js`, `manifest.json`, and `styles.css` as individual GitHub release assets.

## License

[MIT](LICENSE)
