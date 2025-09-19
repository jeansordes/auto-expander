# Auto Expander

This is a sample plugin for Obsidian (https://obsidian.md).

This project uses TypeScript to provide type checking and documentation.
The repo depends on the latest plugin API (obsidian.d.ts) in TypeScript Definition format, which contains TSDoc comments describing what it does.

## Installation

Until the plugin is officially released, you can install it through BRAT (Beta Review and Testing)
1. <a href="https://jeansordes.github.io/redirect?to=obsidian://show-plugin?id=obsidian42-brat" target="_blank">Install the BRAT plugin</a> if you don't have it already
2. <a href="https://jeansordes.github.io/redirect?to=obsidian://brat?plugin=jeansordes/auto-expander" target="_blank">Install Auto Expander by clicking this link</a> (this will open the BRAT plugin and install the plugin)

## Features
This sample plugin demonstrates some of the basic functionality the plugin API can do.
- Adds a ribbon icon, which shows a Notice when clicked.
- Adds a command "Open Auto Expander Modal" which opens a Modal.
- Adds a plugin setting tab to the settings page.
- Registers a global click event and output 'click' to the console.
- Registers a global interval which logs 'setInterval' to the console.

## Development
- Run `npm run dev` to start compilation in watch mode (combine with hot reload plugin for development - https://github.com/pjeby/hot-reload)
- Run `npm run ci` to run the tests, linting, and build (must be done before committing)

### Releasing new releases
- Run `npm run <release-type>` to release a new version
  - `release:patch`: 0.1.0 -> 0.1.1 -> 0.1.2
  - `release:minor`: 0.1.0 -> 0.2.0 -> 0.3.0
  - `release:major`: 0.1.0 -> 1.0.0 -> 2.0.0
  - `release:beta`: 0.1.0 -> 0.1.0-beta.0 -> 0.1.0-beta.1
