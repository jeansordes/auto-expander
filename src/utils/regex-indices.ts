type RangeTuple = [number, number];

type CursorGroups = Record<string, RangeTuple | undefined>;

export type MatchIndices = Array<RangeTuple> & {
	groups?: CursorGroups;
};

function isRangeTuple(value: unknown): value is RangeTuple {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		typeof value[0] === 'number' &&
		typeof value[1] === 'number'
	);
}

function isCursorGroups(value: unknown): value is CursorGroups {
	if (value === undefined) {
		return true;
	}
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const entries = Object.values(value);
	for (const entry of entries) {
		if (entry === undefined) {
			continue;
		}
		if (!isRangeTuple(entry)) {
			return false;
		}
	}
	return true;
}

function isMatchIndices(value: unknown): value is MatchIndices {
	if (!Array.isArray(value)) {
		return false;
	}
	for (const entry of value) {
		if (entry === undefined) {
			continue;
		}
		if (!isRangeTuple(entry)) {
			return false;
		}
	}
	const groupsCandidate = Reflect.get(value, 'groups');
	return isCursorGroups(groupsCandidate);
}

export function extractMatchIndices(match: RegExpExecArray): MatchIndices | null {
	const indicesCandidate = Reflect.get(match, 'indices');
	if (!isMatchIndices(indicesCandidate)) {
		return null;
	}
	return indicesCandidate;
}

export function getCursorGroup(indices: MatchIndices): RangeTuple | undefined {
	const groupsCandidate = Reflect.get(indices, 'groups');
	if (!groupsCandidate) {
		return undefined;
	}
	if (!isCursorGroups(groupsCandidate)) {
		return undefined;
	}
	const cursorEntry = Reflect.get(groupsCandidate, 'CURSOR');
	if (!isRangeTuple(cursorEntry)) {
		return undefined;
	}
	return cursorEntry;
}

export function getMatchRange(indices: MatchIndices): RangeTuple | undefined {
	const firstEntry = indices[0];
	if (!isRangeTuple(firstEntry)) {
		return undefined;
	}
	return firstEntry;
}
