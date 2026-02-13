export function getTodayAsNumber() {
	return parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
}

export function formatDateNumber(dateNumber) {
	const str = String(dateNumber);
	return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;
}

export function formatDateNumberISO(dateNumber) {
	const str = String(dateNumber);
	return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
}
