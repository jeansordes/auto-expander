export interface TriggerContext {
	triggerKey: string;
	originalKey: string;
	insertedText: string;
	beforeText: string;
	beforeCursor: { line: number; ch: number };
	afterText: string;
	afterCursor: { line: number; ch: number };
	cursorCharIndex: number;
	deletedChar: string | null;
}
