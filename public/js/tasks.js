export const STATUSES = Object.freeze({ new: 'Новая', in_progress: 'В работе', done: 'Завершена', cancelled: 'Отменена' });

export function emptyData() {
  return {
    schemaVersion: 1,
    directions: [
      { id: 'automation', name: 'Автоматизация' },
      { id: 'operations', name: 'Операционная эффективность' },
      { id: 'process-analysis', name: 'Процессный анализ' }
    ],
    tasks: []
  };
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isOverdue(task, today = localDate()) {
  return task.dueDate < today && !['done', 'cancelled'].includes(task.status);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function validateData(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.directions) || !Array.isArray(data.tasks)) {
    throw new Error('Неподдерживаемый формат данных. Ожидается JSON версии 1.');
  }
  const directions = new Set();
  for (const item of data.directions) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || directions.has(item.id)
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120) {
      throw new Error('Некорректный справочник направлений.');
    }
    directions.add(item.id);
  }
  if (!directions.size) throw new Error('Нужно хотя бы одно направление.');
  const ids = new Set();
  for (const task of data.tasks) {
    if (!task || typeof task.id !== 'string' || !task.id.trim() || ids.has(task.id)
      || typeof task.title !== 'string' || !task.title.trim() || task.title.length > 200
      || typeof task.description !== 'string' || task.description.length > 5000
      || !directions.has(task.directionId) || !Object.hasOwn(STATUSES, task.status)
      || typeof task.assignee !== 'string' || !task.assignee.trim() || task.assignee.length > 120
      || !validDate(task.dueDate) || !validTimestamp(task.createdAt) || !validTimestamp(task.updatedAt)) {
      throw new Error('Некорректная задача: проверьте обязательные поля, даты и уникальность ID.');
    }
    ids.add(task.id);
  }
  // Return only supported fields; imported objects are never merged into application objects.
  return {
    schemaVersion: 1,
    directions: data.directions.map(({ id, name }) => ({ id, name })),
    tasks: data.tasks.map(({ id, title, description, directionId, status, assignee, dueDate, createdAt, updatedAt }) =>
      ({ id, title, description, directionId, status, assignee, dueDate, createdAt, updatedAt }))
  };
}

export function filterTasks(tasks, filters, today = localDate()) {
  const query = (filters.query || '').trim().toLocaleLowerCase('ru');
  return tasks.filter(task => (!query || task.title.toLocaleLowerCase('ru').includes(query))
    && (!filters.direction || task.directionId === filters.direction)
    && (!filters.status || task.status === filters.status)
    && (!filters.assignee || task.assignee === filters.assignee)
    && (!filters.overdue || isOverdue(task, today)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.createdAt.localeCompare(a.createdAt));
}
