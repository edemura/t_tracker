import { emptyData, validateData } from './tasks.js';

export const STORAGE_KEY = 'taskTracker.data';

export function load(storage = localStorage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === null ? emptyData() : validateData(JSON.parse(raw));
}

export function save(data, storage = localStorage) {
  const checked = validateData(data);
  storage.setItem(STORAGE_KEY, JSON.stringify(checked));
  return checked;
}
