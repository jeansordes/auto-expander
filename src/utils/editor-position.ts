export interface EditorCursorPosition {
	line: number;
	ch: number;
}

export function getCursorCharIndex(text: string, cursor: EditorCursorPosition): number {
	const lines = text.split('\n');
	let charIndex = 0;

	for (let lineIndex = 0; lineIndex < cursor.line; lineIndex++) {
		const line = lines[lineIndex] ?? '';
		const newlineLength = lineIndex < lines.length - 1 ? 1 : 0;
		charIndex += line.length + newlineLength;
	}

	return charIndex + cursor.ch;
}

export function charIndexToEditorPos(text: string, charIndex: number): EditorCursorPosition {
	const lines = text.split('\n');
	let currentIndex = 0;

	for (let line = 0; line < lines.length; line++) {
		const contentLength = lines[line]?.length ?? 0;
		const newlineLength = line < lines.length - 1 ? 1 : 0;
		const lineEnd = currentIndex + contentLength + newlineLength;
		if (lineEnd > charIndex) {
			return { line, ch: charIndex - currentIndex };
		}
		currentIndex = lineEnd;
	}

	const lastLineIndex = Math.max(0, lines.length - 1);
	const lastLine = lines[lastLineIndex] ?? '';
	return { line: lastLineIndex, ch: lastLine.length };
}
