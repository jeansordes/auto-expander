/**
 * Raw snippet configuration as defined by user in JSONC
 */
export interface Snippet {
  /** Text used to trigger expansion */
  trigger: string;
  /** Optional replacement text or array of lines */
  replacement?: string | string[];
  /** Optional command IDs to execute after expansion */
  commands?: string | string[];
  /** Whether the trigger should be treated as a regex pattern (no escaping) */
  regex?: boolean;
}

/**
 * Parsed and validated snippet ready for runtime use
 */
export interface ParsedSnippet {
  /** Unique identifier for this snippet */
  id: string;
  /** Original trigger string */
  trigger: string;
  /** Normalized replacement text as array of lines */
  replacement: string[];
  /** Normalized command IDs as array */
  commands: string[];
  /** Parsed cursor marker options (e.g., ['space', 'tab', 'instant']) */
  cursorMarkerOptions: string[];
  /** Whether the trigger should be treated as a regex pattern (no escaping) */
  regex: boolean;
  /** Whether this snippet is valid and can be used */
  isValid: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Plugin settings interface
 */
export interface AutoExpanderSettings {
  /** User-defined snippets as JSONC string */
  snippetsJsonc: string;
  /** Whether to wrap text in the editor textarea */
  wrapText: boolean;
  /** Delay in milliseconds between executing commands after snippet expansion */
  commandDelay: number;
}

/** Default settings for the plugin */
export const DEFAULT_SETTINGS: AutoExpanderSettings = {
  snippetsJsonc: '',
  wrapText: false,
  commandDelay: 100,
};
