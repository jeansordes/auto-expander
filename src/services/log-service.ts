import createDebug, { type Debugger } from 'debug';
import pluginInfos from '../../manifest.json';

interface LogEntry {
	timestamp: number;
	namespace: string;
	message: string;
}

class DebugLogService {
	private static instance: DebugLogService;
	private readonly entries: LogEntry[] = [];
	private maxEntries = 500;

	private constructor() {
		// Singleton; use getInstance() instead of direct construction
	}

	static getInstance(): DebugLogService {
		if (!DebugLogService.instance) {
			DebugLogService.instance = new DebugLogService();
		}
		return DebugLogService.instance;
	}

	setMaxEntries(limit: number): void {
		this.maxEntries = Math.max(50, limit);
		this.trim();
	}

	record(namespace: string, args: unknown[]): void {
		const message = args.map((part) => {
			if (typeof part === 'string') {
				return part;
			}
			try {
				return JSON.stringify(part);
			} catch {
				return String(part);
			}
		}).join(' ');
		this.push(namespace, message);
	}

	recordManual(namespace: string, message: string): void {
		this.push(namespace, message);
	}

	getEntries(): LogEntry[] {
		return [...this.entries];
	}

	getLogString(): string {
		return this.entries
			.map((entry) => {
				const iso = new Date(entry.timestamp).toISOString();
				return `[${iso}] [${entry.namespace}] ${entry.message}`;
			})
			.join('\n');
	}

	clear(): void {
		this.entries.length = 0;
	}

	private push(namespace: string, message: string): void {
		this.entries.push({
			timestamp: Date.now(),
			namespace,
			message,
		});
		this.trim();
	}

	private trim(): void {
		if (this.entries.length > this.maxEntries) {
			this.entries.splice(0, this.entries.length - this.maxEntries);
		}
	}
}

const logService = DebugLogService.getInstance();

const originalLog: (...args: unknown[]) => void = createDebug.log ?? (() => undefined);

function isDebuggerContext(value: unknown): value is Debugger {
	if (typeof value !== 'function') {
		return false;
	}
	const namespace = Reflect.get(value, 'namespace');
	return typeof namespace === 'string';
}

createDebug.log = function (...args: unknown[]) {
	const namespace = isDebuggerContext(this)
		? this.namespace
		: pluginInfos.id;
	logService.record(namespace, args);
	originalLog.apply(this, args);
};

export { DebugLogService };
export default logService;
