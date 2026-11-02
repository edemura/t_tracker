import { STATUSES, emptyData, validateData, isOverdue, filterTasks, localDate } from './tasks.js';
import { load, save, STORAGE_KEY } from './storage.js';

const $ = selector => document.querySelector(selector);
const form = $('#task-form');
const dialog = $('#task-dialog');
let data = emptyData();
let editingId = null;
let storageBlocked = false;
let noticeTimer;

function notify(message, error = false) {
  clearTimeout(noticeTimer);
  const element = $('#notice');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.hidden = false;
  if (!error) noticeTimer = setTimeout(() => { element.hidden = true; }, 5000);
}

try { data = load(); } catch {
  storageBlocked = true;
  notify('Не удалось прочитать данные браузера. Изменения заблокированы, чтобы не перезаписать сохраненные задачи. Проверьте доступ к хранилищу или восстановите данные через импорт JSON.', true);
}

function options(select, items, placeholder) {
  const previous = select.value;
  select.replaceChildren();
  if (placeholder) select.add(new Option(placeholder, ''));
  for (const [value, text] of items) select.add(new Option(text, value));
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
}

function render() {
  const directions = data.directions.map(item => [item.id, item.name]);
  const assignees = [...new Set(data.tasks.map(task => task.assignee))].sort((a,b) => a.localeCompare(b, 'ru'));
  options($('#filter-direction'), directions, 'Все направления');
  options($('#filter-status'), Object.entries(STATUSES), 'Все статусы');
  options($('#filter-assignee'), assignees.map(name => [name, name]), 'Все ответственные');
  $('#assignees').replaceChildren(...assignees.map(name => new Option(name, name)));
  $('#count-all').textContent = data.tasks.length;
  $('#count-progress').textContent = data.tasks.filter(task => task.status === 'in_progress').length;
  $('#count-overdue').textContent = data.tasks.filter(task => isOverdue(task)).length;
  $('#count-done').textContent = data.tasks.filter(task => task.status === 'done').length;
  const tasks = filterTasks(data.tasks, {
    query: $('#search').value, direction: $('#filter-direction').value,
    status: $('#filter-status').value, assignee: $('#filter-assignee').value,
    overdue: $('#filter-overdue').checked
  });
  $('#visible-count').textContent = tasks.length;
  const list = $('#task-list');
  list.replaceChildren();
  for (const task of tasks) {
    const row = document.createElement('tr');
    row.classList.toggle('overdue', isOverdue(task));
    const titleCell = row.insertCell();
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;
    const direction = document.createElement('span');
    direction.className = 'task-direction';
    direction.textContent = data.directions.find(item => item.id === task.directionId).name;
    titleCell.append(title, direction);
    const badge = document.createElement('span');
    badge.className = `badge ${task.status}`;
    badge.textContent = STATUSES[task.status];
    row.insertCell().append(badge);
    row.insertCell().textContent = task.assignee;
    const dateCell = row.insertCell();
    dateCell.className = 'due-date';
    dateCell.textContent = task.dueDate.split('-').reverse().join('.');
    if (isOverdue(task)) {
      const label = document.createElement('span');
      label.className = 'overdue-label'; label.textContent = 'Просрочена'; dateCell.append(label);
    }
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    for (const [label, action, className] of [['Изменить', () => openTask(task), ''], ['Удалить', () => deleteTask(task), 'delete']]) {
      const button = document.createElement('button');
      button.textContent = label; button.className = className; button.disabled = storageBlocked;
      button.setAttribute('aria-label', `${label}: ${task.title}`);
      button.addEventListener('click', action); actions.append(button);
    }
    row.insertCell().append(actions); list.append(row);
  }
  $('#empty').hidden = tasks.length > 0;
  $('#empty h3').textContent = data.tasks.length ? 'Задачи не найдены' : 'Начнем с первой задачи';
  $('#empty p').textContent = data.tasks.length ? 'Попробуйте изменить условия поиска или сбросить фильтры.' : 'Добавьте задачу, назначьте ответственного и укажите срок.';
  $('#empty-add').hidden = data.tasks.length > 0;
  for (const id of ['#add-task', '#empty-add', '#export']) $(id).disabled = storageBlocked;
}

function openTask(task = null) {
  if (storageBlocked) return;
  editingId = task?.id ?? null;
  form.reset();
  options(form.elements.directionId, data.directions.map(item => [item.id, item.name]));
  options(form.elements.status, Object.entries(STATUSES));
  form.elements.status.value = 'new';
  form.elements.dueDate.value = localDate();
  if (task) for (const key of ['title', 'description', 'directionId', 'status', 'assignee', 'dueDate']) form.elements[key].value = task[key];
  $('#form-heading').textContent = task ? 'Редактировать задачу' : 'Новая задача';
  $('#form-error').hidden = true;
  dialog.showModal();
  form.elements.title.focus();
}

function commit(next) {
  try {
    // Read again before writing, so an older tab cannot silently overwrite newer data.
    const current = load();
    if (JSON.stringify(current) !== JSON.stringify(data)) {
      data = current;
      render();
      throw new Error('Данные изменились в другой вкладке. Список обновлен. Повторите действие с актуальными данными.');
    }
    data = save(next);
    render();
    return true;
  } catch (error) {
    notify(`Изменения не сохранены. ${error.message}`, true);
    return false;
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const now = new Date().toISOString();
  const oldTask = data.tasks.find(task => task.id === editingId);
  if (editingId && !oldTask) {
    $('#form-error').textContent = 'Эта задача уже удалена. Закройте форму и обновите список.';
    $('#form-error').hidden = false;
    return;
  }
  const task = { id: editingId || crypto.randomUUID(), createdAt: oldTask?.createdAt ?? now, updatedAt: now };
  for (const key of ['title', 'description', 'directionId', 'status', 'assignee', 'dueDate']) task[key] = form.elements[key].value.trim();
  try {
    const next = validateData({ ...data, tasks: editingId ? data.tasks.map(item => item.id === editingId ? task : item) : [...data.tasks, task] });
    if (commit(next)) { dialog.close(); notify('Задача сохранена.'); }
    else { $('#form-error').textContent = 'Не удалось сохранить задачу. Подробности показаны на странице; введенные данные остались в форме.'; $('#form-error').hidden = false; }
  } catch (error) {
    $('#form-error').textContent = error.message; $('#form-error').hidden = false;
  }
});

function deleteTask(task) {
  if (confirm(`Удалить задачу «${task.title}»? Это действие нельзя отменить.`)) {
    if (commit({ ...data, tasks: data.tasks.filter(item => item.id !== task.id) })) notify('Задача удалена.');
  }
}

$('#add-task').addEventListener('click', () => openTask());
$('#empty-add').addEventListener('click', () => openTask());
for (const id of ['#close-dialog', '#cancel']) $(id).addEventListener('click', () => dialog.close());
for (const id of ['#search', '#filter-direction', '#filter-status', '#filter-assignee', '#filter-overdue']) $(id).addEventListener('input', render);
$('#reset').addEventListener('click', () => {
  for (const id of ['#search', '#filter-direction', '#filter-status', '#filter-assignee']) $(id).value = '';
  $('#filter-overdue').checked = false; render();
});
$('#export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = `tasks-${localDate()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Файл превышает 5 МБ.');
    const imported = validateData(JSON.parse(await file.text()));
    if (!confirm(`Импортировать ${imported.tasks.length} задач? Текущие данные браузера будут полностью заменены. Сначала экспортируйте их, если нужна резервная копия.`)) return;
    data = save(imported); storageBlocked = false; dialog.close(); render();
    notify(`Импорт завершен. Задач: ${data.tasks.length}.`);
  } catch (error) { notify(`Импорт не выполнен. ${error.message}`, true); }
});

window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try {
    data = load(); storageBlocked = false; render();
    // Close stale forms: do not overwrite a task edited in another tab.
    dialog.close(); notify('Данные обновлены из другой вкладки.');
  } catch { storageBlocked = true; render(); dialog.close(); notify('Не удалось прочитать изменения из другой вкладки. Восстановите данные через импорт JSON.', true); }
});
window.addEventListener('focus', render);
setInterval(render, 60_000);
render();
