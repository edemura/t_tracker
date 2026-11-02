import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, validateData, isOverdue, filterTasks } from '../public/js/tasks.js';
import { load, save, STORAGE_KEY } from '../public/js/storage.js';

const task = (overrides = {}) => ({ id: 'test-id', title: 'Отчет', description: '', directionId: 'automation', status: 'new', assignee: 'Иван', dueDate: '2026-11-01', createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z', ...overrides });

test('Просрочка учитывает сегодняшний срок и закрытые статусы', () => {
  assert.equal(isOverdue(task(), '2026-11-02'), true);
  for (const status of ['done', 'cancelled']) assert.equal(isOverdue(task({ status }), '2026-11-02'), false);
  assert.equal(isOverdue(task({ dueDate: '2026-11-02' }), '2026-11-02'), false);
  assert.equal(isOverdue(task({ dueDate: '2026-11-03' }), '2026-11-02'), false);
});

test('Импорт отклоняет невозможные даты, дубликаты и неизвестные справочники', () => {
  for (const changes of [{ dueDate: '2026-02-30' }, { status: 'unknown' }, { directionId: 'missing' }, { title: '   ' }, { createdAt: 'yesterday' }]) {
    assert.throws(() => validateData({ ...emptyData(), tasks: [task(changes)] }));
  }
  assert.throws(() => validateData({ ...emptyData(), tasks: [task(), task()] }));
  assert.throws(() => validateData({ ...emptyData(), schemaVersion: 2 }));
});

test('Фильтры работают совместно, поиск нечувствителен к регистру', () => {
  const tasks = [task(), task({ id: 'other', assignee: 'Мария' }), task({ id: 'done', status: 'done' })];
  assert.deepEqual(filterTasks(tasks, { query: 'ОТЧ', direction: 'automation', status: 'new', assignee: 'Иван', overdue: true }, '2026-11-02').map(item => item.id), ['test-id']);
});

test('Сохранение и загрузка сохраняют структуру данных', () => {
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  assert.deepEqual(load(storage), emptyData());
  const data = { ...emptyData(), tasks: [task()] };
  save(data, storage);
  assert.deepEqual(load(storage), data);
  memory.set(STORAGE_KEY, '{broken');
  assert.throws(() => load(storage));
  assert.equal(memory.get(STORAGE_KEY), '{broken');
});

test('Ошибка записи не меняет исходные данные', () => {
  const data = { ...emptyData(), tasks: [task()] };
  const before = structuredClone(data);
  assert.throws(() => save(data, { setItem: () => { throw new Error('Quota exceeded'); } }));
  assert.deepEqual(data, before);
});
