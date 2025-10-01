#  (2025-10-01)

#  (2025-09-29)

### Bug Fixes

* prevent expansion when editing config file ([30092f0](https://github.com/jeansordes/auto-expander/commit/30092f0c64f28dc25a1177dc48925445e9cfa99c))

#  (2025-09-27)

### Bug Fixes

* avoid blocking startup waiting for layout ([83244cb](https://github.com/jeansordes/auto-expander/commit/83244cbeb7b032d610cbf7a61a68c00c4ba54561))

#  (2025-09-27)

### Bug Fixes

* ensure config file path loads after startup ([95e0f7c](https://github.com/jeansordes/auto-expander/commit/95e0f7c5ca427be48db0d1e02ef09af6351c1069))

#  (2025-09-27)

### Bug Fixes

* correct line numbers in config file syntax error messages ([618d17e](https://github.com/jeansordes/auto-expander/commit/618d17e3fce44a9aae251c5d3fed0bd4191162a2))

#  (2025-09-27)

#  (2025-09-27)

### Features

* **ui:** improve config path input layout with responsive design ([d21f2a2](https://github.com/jeansordes/auto-expander/commit/d21f2a270866851bce6342ca0526e5414ea340e6))

#  (2025-09-27)

### Bug Fixes

* make explicit regex triggers respect cursor position ([2133658](https://github.com/jeansordes/auto-expander/commit/2133658e00bc97df5ed61f5ed331fcfb64bedc60))

#  (2025-09-27)

### Bug Fixes

* **regex:** add multiline flag to regex triggers ([1ad31e0](https://github.com/jeansordes/auto-expander/commit/1ad31e0acf211a0867a2a363754d5a38e2b03924))

#  (2025-09-27)

### Bug Fixes

* **text-replacement:** fix cursor positioning when capture groups are used in replacement strings ([f97e379](https://github.com/jeansordes/auto-expander/commit/f97e379afbf9204cb2d8ccd7b2d778b47f5b6f61))

#  (2025-09-26)

### Features

* **snippets:** simplify regex detection by using /.../ syntax only ([48fb8f3](https://github.com/jeansordes/auto-expander/commit/48fb8f327531c49f434a4b954b0d858509b058aa))

### BREAKING CHANGES

* **snippets:** The `regex` field in snippet configuration is no longer supported.
Regex patterns must now use the `/.../` syntax. Previous configurations using
`"regex": true` will no longer work and need to be updated to wrap triggers
in forward slashes.

#  (2025-09-26)

#  (2025-09-26)

### Features

* add external config file support for snippets ([717e182](https://github.com/jeansordes/auto-expander/commit/717e18219b4583f8dea11e6b1ba37ac2e4657d6e))

#  (2025-09-23)

#  (2025-09-23)

#  (2025-09-23)

#  (2025-09-23)

#  (2025-09-23)

#  (2025-09-23)

### Bug Fixes

* **mobile:** enhance logging for snippet execution and trigger matching ([ec06152](https://github.com/jeansordes/auto-expander/commit/ec06152de51088dbef07ca72758bc0be5609b0f1))

#  (2025-09-23)

### Bug Fixes

* use separate tag patterns for better GitHub Actions compatibility ([6096dfe](https://github.com/jeansordes/auto-expander/commit/6096dfe6aa2b08fb16a1cf26fafef181c2c08eae))

#  (2025-09-23)

### Bug Fixes

* refine context handling in instant input logic ([eff3a35](https://github.com/jeansordes/auto-expander/commit/eff3a35e061683e0d740f7dc8f888fe0605925f3))
* remove branch trigger from release workflow to prevent conflicts ([85e6d40](https://github.com/jeansordes/auto-expander/commit/85e6d40a77f251209f4e72036da343043f5c8956))

#  (2025-09-23)

### Bug Fixes

* properly parse version numbers in release script to avoid NaN ([3aaa41d](https://github.com/jeansordes/auto-expander/commit/3aaa41d3c4550c2feade26c3a8adac6c4701da9f))
* simplify tag pattern to support both normal and beta releases ([ab11f86](https://github.com/jeansordes/auto-expander/commit/ab11f863feb3137b7140ace95dfff0f716222088))
* streamline instant trigger handling logic in ExpansionService ([973e0e4](https://github.com/jeansordes/auto-expander/commit/973e0e4788cb78e9d02579d4b89b025055100527))

#  (2025-09-23)

### Bug Fixes

* defer instant trigger handling when text not yet inserted ([ea3efd8](https://github.com/jeansordes/auto-expander/commit/ea3efd8ae3842f1a16f74f089453510afe871a96))
* update release workflow to support both normal and beta releases ([760de1a](https://github.com/jeansordes/auto-expander/commit/760de1a5d2b516f8eff15713469fa2bb3f89c08d))

#  (2025-09-23)

### Features

* add debug logging for keyboard/input events ([129264f](https://github.com/jeansordes/auto-expander/commit/129264faf748212b54da121e20a921f79f67ea8c))

#  (2025-09-23)

#  (2025-09-23)

### Bug Fixes

* improve iOS input handling in instant input service ([bee4adb](https://github.com/jeansordes/auto-expander/commit/bee4adb6c56b76c20feed8422f88782767df5734))

#  (2025-09-20)

### Bug Fixes

* enhance instant input handling in ExpansionService ([f24aa03](https://github.com/jeansordes/auto-expander/commit/f24aa03cc7a1d1beb5e958137f8c820cafbfa62f))

#  (2025-09-20)

### Bug Fixes

* another attempt at fixing the ios keyboard event register ([0c894f1](https://github.com/jeansordes/auto-expander/commit/0c894f1ac2a201e8678b4a0005363ebd7dd941af))

#  (2025-09-20)

### Bug Fixes

* improve character handling for instant triggers on iOS ([0da531a](https://github.com/jeansordes/auto-expander/commit/0da531ae003551c00a2e715ac9ac411acd5dc546))

#  (2025-09-20)

#  (2025-09-20)

### Features

* enhance trigger key handling and context management ([6547c66](https://github.com/jeansordes/auto-expander/commit/6547c66f244a396833eab4bd642e2e81076ca837))

#  (2025-09-20)

* feat!: refactor to v0.2.0 ([3498857](https://github.com/jeansordes/auto-expander/commit/34988574ff64777b42eec8f38c349a12473f45f1))

### Features

* **ui:** add JSONC syntax highlighting to snippets settings editor ([a992baf](https://github.com/jeansordes/auto-expander/commit/a992bafae10d173459f6e14ff1011a858fa0d442))

### BREAKING CHANGES

* Complete architectural overhaul from monolithic structure to modular service-oriented design

- **Architecture**: Migrate from single-file implementation to service layer pattern with dependency injection
- **New Services**:
  - SettingsService: Centralized settings management
  - SnippetService: Snippet parsing, validation, and caching
  - ExpansionService: Core expansion logic and trigger handling
  - RegexMatcher: Advanced regex compilation and matching
  - CommandExecutionService: Asynchronous command execution with delays
  - SnippetExecutor: Snippet expansion and cursor positioning
  - TextReplacementService: Editor text manipulation utilities
- **Utilities**: Add regex-indices and editor-position utilities for advanced text processing
- **Testing**: Implement Jest test suite with mocks and comprehensive coverage
- **Documentation**: Update specs.md with implementation phases and technical requirements
- **Code Quality**: Strict TypeScript with proper error handling and debug logging
- **Performance**: Optimized snippet lookup with Map-based caching and validation safeguards
- **Mobile Support**: Maintain full mobile compatibility throughout refactor

This major refactor establishes a solid foundation for future feature development

