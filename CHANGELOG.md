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

