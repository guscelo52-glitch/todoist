import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import * as S from './store.js';
import { iso, fromIso, addDays, norm, parseQuick, nextOccurrence, matchFilter } from './logic.js';
import { schedule, askPermission } from './notify.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newId = () => crypto.randomUUID();
const COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#b45309', '#be185d', '#4d7c0f', '#475569'];

let items = [], user = null, status = {}, write;
let view = { type: 'today' }, layout = {}, month = new Date(), search = '';

const of = type => items.filter(i => i.type === type).sort((a, b) => (a.order || 0) - (b.order || 0));
const byId = id => items.find(i => i.id === id);
const tasks = () => of('task');
const open_ = () => tasks().filter(t => !t.done);
const projectName = id => byId(id)?.name || 'Entrada';
const put = (id, data) => write([{ id, data }]);
const create = (type, data) => { const id = newId(); put(id, { type, order: Date.now(), ...data }); return id; };
const today = () => iso(new Date());
const sorter = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99') || (a.priority || 4) - (b.priority || 4) || a.order - b.order;
const descendants = id => tasks().filter(t => t.parentId === id).flatMap(t => [t, ...descendants(t.id)]);

function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button>Desfazer</button>' : ''}`;
  el.classList.add('show');
  if (undo) el.querySelector('button').onclick = () => { undo(); el.classList.remove('show'); };
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 5000);
}

function fmtDate(s) {
  const t = new Date();
  if (s === iso(t)) return 'Hoje';
  if (s === iso(addDays(t, 1))) return 'Amanhã';
  return fromIso(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', ...(s.slice(0, 4) !== String(t.getFullYear()) && { year: 'numeric' }) });
}

function toggle(t) {
  const before = { done: !!t.done, doneAt: t.doneAt || '', due: t.due || '' };
  if (!t.done && t.repeat && t.due) {
    const subs = descendants(t.id).map(s => ({ id: s.id, done: !!s.done }));
    const due = nextOccurrence(t.due, t.repeat);
    write([{ id: t.id, data: { due } }, ...subs.map(s => ({ id: s.id, data: { done: false } }))]);
    toast('Próxima: ' + fmtDate(due), () => write([{ id: t.id, data: before }, ...subs.map(s => ({ id: s.id, data: { done: s.done } }))]));
  } else {
    put(t.id, { done: !t.done, doneAt: t.done ? '' : new Date().toISOString() });
    if (!t.done) toast('Tarefa concluída', () => put(t.id, before));
  }
}

function row(t, depth = 0) {
  const subs = tasks().filter(s => s.parentId === t.id);
  const meta = [
    t.due && `<span class="${!t.done && t.due < today() ? 'late' : ''}">📅 ${fmtDate(t.due)} ${esc(t.time || '')}</span>`,
    t.repeat && '<span>🔁</span>',
    t.remind !== null && t.remind !== undefined && t.due && '<span>🔔</span>',
    subs.length && `<span>☑ ${subs.filter(s => s.done).length}/${subs.length}</span>`,
    ...(t.labels || []).map(l => `<span class="tag">@${esc(l)}</span>`),
    view.type !== 'project' && `<span class="proj">${esc(projectName(t.projectId))}</span>`
  ].filter(Boolean).join('');
  return `<div class="task ${t.done ? 'done' : ''}" style="margin-left:${depth * 28}px" data-open="${esc(t.id)}" draggable="true">
    <button class="check p${+t.priority || 4}" data-toggle="${esc(t.id)}" aria-label="${t.done ? 'Reabrir' : 'Concluir'}">${t.done ? '✓' : ''}</button>
    <div><div class="title">${esc(t.title)}</div><div class="meta">${meta}</div></div></div>`;
}
function tree(list) {
  const ids = new Set(list.map(t => t.id));
  const walk = (t, d) => row(t, d) + list.filter(c => c.parentId === t.id).map(c => walk(c, d + 1)).join('');
  return list.filter(t => !ids.has(t.parentId)).map(t => walk(t, 0)).join('');
}
const group = (title, list, attrs = '') => `<section class="group" ${attrs}><h3>${esc(title)} <small>${list.length}</small></h3>${list.map(t => row(t)).join('')}</section>`;
const empty = msg => `<p class="empty">${msg}</p>`;

function navItem(type, label, icon, id = '', count = '', indent = 0) {
  const on = view.type === type && (view.id || '') === id;
  return `<button class="nav ${on ? 'on' : ''}" style="padding-left:${12 + indent * 18}px" data-view="${type}" data-id="${esc(id)}"><span>${icon}</span><b>${esc(label)}</b><small>${count || ''}</small></button>`;
}

function sidebar() {
  const o = open_();
  const projects = of('project');
  const pnav = (parent, d) => projects.filter(p => (p.parentId || '') === parent)
    .map(p => navItem('project', p.name, `<i style="background:${esc(p.color)}"></i>`, p.id, o.filter(t => t.projectId === p.id).length, d) + pnav(p.id, d + 1)).join('');
  $('#side').innerHTML = `<div class="brand"><img src="icon.png" alt="">Pauta</div>
    <button class="primary" data-act="add">＋ Nova tarefa</button>
    ${navItem('search', 'Buscar', '🔍')}
    ${navItem('inbox', 'Entrada', '📥', '', o.filter(t => !byId(t.projectId)).length)}
    ${navItem('today', 'Hoje', '☀️', '', o.filter(t => t.due && t.due <= today()).length)}
    ${navItem('upcoming', 'Em breve', '🗓️')}
    ${navItem('done', 'Concluídas', '✅')}
    <h4>Projetos <button data-act="new-project" aria-label="Novo projeto">＋</button></h4>${pnav('', 0)}
    <h4>Filtros <button data-act="new-filter" aria-label="Novo filtro">＋</button></h4>
    ${of('filter').map(f => navItem('filter', f.name, '⚗️', f.id)).join('')}
    <h4>Etiquetas</h4>
    ${[...new Set(tasks().flatMap(t => t.labels || []))].sort().map(l => navItem('label', l, '🏷️', l, o.filter(t => (t.labels || []).includes(l)).length)).join('')}
    <hr>${navItem('settings', 'Ajustes', '⚙️')}`;
}

function calendar(list) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  let d = addDays(first, -first.getDay()), cells = '';
  for (let i = 0; i < 42; i++, d = addDays(d, 1)) {
    const s = iso(d);
    cells += `<div class="day ${d.getMonth() !== month.getMonth() ? 'out' : ''} ${s === today() ? 'now' : ''}" data-day="${s}">
      <span>${d.getDate()}</span>${list.filter(t => t.due === s).sort(sorter).map(t => `<div class="chip p${+t.priority || 4}" data-open="${esc(t.id)}" draggable="true">${esc(t.title)}</div>`).join('')}</div>`;
  }
  return `<div class="calhead"><button data-act="prev">‹</button><b>${month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</b><button data-act="next">›</button></div>
  <div class="cal">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(x => `<em>${x}</em>`).join('')}${cells}</div>`;
}

function projectBody(pid) {
  const inProject = t => pid ? t.projectId === pid : !byId(t.projectId);
  const list = open_().filter(inProject).sort((a, b) => a.order - b.order);
  const sections = of('section').filter(s => s.projectId === pid);
  const mode = layout[pid] || 'list';
  const has = id => sections.some(s => s.id === id);
  const groups = [{ id: '', name: 'Sem seção' }, ...sections].map(s => ({ ...s, list: list.filter(t => s.id ? t.sectionId === s.id : !has(t.sectionId)) }));
  const head = s => `<h3><span>${esc(s.name)} <small>${s.list.length}</small></span>${s.id ? `<span><button data-act="rename-section" data-id="${esc(s.id)}" aria-label="Renomear seção">✎</button><button data-act="del-section" data-id="${esc(s.id)}" aria-label="Excluir seção">🗑</button></span>` : ''}</h3>`;
  let html = `<div class="tabs">${[['list', 'Lista'], ['board', 'Quadro'], ['cal', 'Calendário']].map(([k, n]) => `<button class="${mode === k ? 'on' : ''}" data-layout="${k}">${n}</button>`).join('')}</div>`;
  if (mode === 'cal') return html + calendar(list);
  if (mode === 'board') return html + `<div class="board">${groups.map(s => `<section class="col" data-section="${esc(s.id)}">${head(s)}${s.list.map(t => row(t)).join('')}<button class="ghost" data-act="add" data-section="${esc(s.id)}">＋ Tarefa</button></section>`).join('')}<button class="ghost" data-act="new-section">＋ Seção</button></div>`;
  html += groups.map(s => (!s.id && !s.list.length) ? '' : `<section class="group" data-section="${esc(s.id)}">${s.id || sections.length ? head(s) : ''}${tree(s.list)}<button class="ghost" data-act="add" data-section="${esc(s.id)}">＋ Tarefa</button></section>`).join('');
  if (!list.length && !sections.length) html += empty('Nenhuma tarefa aqui. Que tal adicionar a primeira?') + '<button class="ghost" data-act="add">＋ Tarefa</button>';
  return html + '<button class="ghost" data-act="new-section">＋ Seção</button>';
}

function searchResults() {
  const q = norm(search.trim());
  if (!q) return empty('Digite para buscar por título, descrição ou etiqueta.');
  const r = tasks().filter(t => norm(`${t.title} ${t.notes || ''} ${(t.labels || []).join(' ')}`).includes(q)).sort(sorter);
  return r.map(t => row(t)).join('') || empty('Nada encontrado.');
}

function render() {
  if (!user) return;
  if ((view.type === 'project' || view.type === 'filter') && !byId(view.id)) view = { type: 'inbox' };
  sidebar();
  const o = open_();
  let title = '', body = '', tools = '';
  if (view.type === 'inbox') { title = 'Entrada'; body = projectBody(''); }
  else if (view.type === 'today') {
    title = 'Hoje';
    const late = o.filter(t => t.due && t.due < today()).sort(sorter), now = o.filter(t => t.due === today()).sort(sorter);
    body = (late.length ? group('Atrasadas', late) : '') + group('Hoje', now) + (!late.length && !now.length ? empty('Dia livre! Nada pendente para hoje.') : '') + '<button class="ghost" data-act="add">＋ Tarefa</button>';
  } else if (view.type === 'upcoming') {
    title = 'Em breve';
    const mode = layout.upcoming || 'list';
    body = `<div class="tabs"><button class="${mode === 'list' ? 'on' : ''}" data-layout="list">Lista</button><button class="${mode === 'cal' ? 'on' : ''}" data-layout="cal">Calendário</button></div>`;
    if (mode === 'cal') body += calendar(o);
    else {
      for (let i = 0; i < 7; i++) { const d = addDays(new Date(), i), s = iso(d); body += group(`${fmtDate(s)} · ${d.toLocaleDateString('pt-BR', { weekday: 'long' })}`, o.filter(t => t.due === s).sort(sorter), `data-day="${s}"`); }
      const later = o.filter(t => t.due >= iso(addDays(new Date(), 7))).sort(sorter);
      if (later.length) body += group('Mais adiante', later);
    }
  } else if (view.type === 'project') {
    const p = byId(view.id); title = p.name; body = projectBody(p.id);
    tools = '<button data-act="edit-project">✎ Editar</button><button data-act="del-project">🗑 Excluir</button>';
  } else if (view.type === 'filter') {
    const f = byId(view.id); title = f.name;
    const r = o.filter(t => matchFilter(t, f.query, { projectName })).sort(sorter);
    body = `<p class="hint">Consulta: <code>${esc(f.query)}</code></p>` + (r.map(t => row(t)).join('') || empty('Nenhuma tarefa corresponde a este filtro.'));
    tools = '<button data-act="edit-filter">✎ Editar</button><button data-act="del-filter">🗑 Excluir</button>';
  } else if (view.type === 'label') {
    title = '@' + view.id; body = o.filter(t => (t.labels || []).includes(view.id)).sort(sorter).map(t => row(t)).join('') || empty('Sem tarefas com esta etiqueta.');
  } else if (view.type === 'done') {
    title = 'Concluídas';
    body = tasks().filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 200).map(t => row(t)).join('') || empty('Nada concluído ainda.');
  } else if (view.type === 'search') {
    title = 'Buscar'; body = `<input id="q" type="search" placeholder="Buscar tarefas" value="${esc(search)}"><div id="results">${searchResults()}</div>`;
  } else {
    title = 'Ajustes';
    body = `<div class="card"><p>${S.cloud ? 'Conectado como <b>' + esc(user) + '</b>' : '<b>Modo local:</b> os dados ficam só neste aparelho. Preencha <code>src/firebase-config.js</code> para sincronizar.'}</p>
      <button data-act="perm">🔔 Permitir notificações</button> <button data-act="export">⬇ Exportar cópia (JSON)</button> ${S.cloud ? '<button data-act="logout">Sair</button>' : ''}</div>`;
  }
  const sync = !S.cloud ? 'Modo local' : status.pending ? 'Aguardando envio…' : status.cached ? 'Offline / conectando' : 'Sincronizado';
  const focused = document.activeElement?.id === 'q';
  $('#main').innerHTML = `<header><button id="menu" data-act="menu" aria-label="Menu">☰</button><h1>${esc(title)}</h1><div class="tools">${tools}<small>${sync}</small></div></header>${body}`;
  if (view.type === 'search') {
    const q = $('#q'); q.oninput = () => { search = q.value; $('#results').innerHTML = searchResults(); };
    if (focused || !search) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
}

/* ---------- diálogos ---------- */
const dlg = $('#dlg');
function modal(html, onSubmit) {
  dlg.innerHTML = `<form method="dialog">${html}<footer><button type="button" data-close>Cancelar</button><button class="primary" value="ok">Salvar</button></footer></form>`;
  const form = dlg.querySelector('form');
  form.onsubmit = e => { e.preventDefault(); if (onSubmit(new FormData(form)) !== false) dlg.close(); };
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
  return form;
}
const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;

function ensureProject(name) {
  if (!name) return '';
  if (norm(name) === 'entrada') return '';
  return of('project').find(p => norm(p.name) === norm(name))?.id || create('project', { name, color: COLORS[0], parentId: '' });
}

function quickAdd(sectionId = '') {
  const ctxProject = view.type === 'project' ? view.id : '';
  const form = modal(`<h2>Nova tarefa</h2><input name="text" placeholder="Corrigir provas amanhã 14h p1 #Aulas @escola" autocomplete="off" required autofocus>
    <div id="preview" class="meta"></div><textarea name="notes" placeholder="Descrição (opcional)"></textarea>
    <p class="hint">Datas: hoje, amanhã, na sexta, 15/12, dia 5, em 3 dias · Repetir: toda sexta, todo dia 10, a cada 2 semanas · p1–p4, #Projeto (use _ no lugar de espaço), @etiqueta, !30min (avisar antes)</p>`, f => {
    const p = parseQuick(f.get('text'));
    if (!p.title) return false;
    if (!p.due && view.type === 'today') p.due = today();
    if (!p.due) p.remind = null;
    const projectId = p.project ? ensureProject(p.project) : ctxProject;
    const labels = view.type === 'label' && !p.labels.includes(view.id) ? [...p.labels, view.id] : p.labels;
    const { project, ...data } = p;
    create('task', { ...data, labels, projectId, sectionId: p.project ? '' : sectionId, parentId: '', notes: f.get('notes'), done: false });
    if (p.remind !== null) askPermission().then(() => schedule(tasks()));
    toast('Tarefa adicionada em ' + (p.project || projectName(projectId)));
  });
  form.text.oninput = () => {
    const p = parseQuick(form.text.value);
    $('#preview').textContent = [p.due && '📅 ' + fmtDate(p.due) + ' ' + p.time, p.repeat && '🔁 repete', p.priority < 4 && 'P' + p.priority, p.project && '#' + p.project, ...p.labels.map(l => '@' + l), p.remind !== null && p.due && '🔔'].filter(Boolean).join('  ·  ');
  };
}

const repeatKey = r => r ? `${r.unit}:${r.n}` : '';
function editTask(id) {
  const t = byId(id); if (!t) return;
  const reps = [['', 'Não repete'], ['day:1', 'Todo dia'], ['weekday:1', 'Dias úteis'], ['week:1', 'Toda semana'], ['week:2', 'A cada 2 semanas'], ['month:1', 'Todo mês'], ['year:1', 'Todo ano']];
  if (t.repeat && !reps.some(r => r[0] === repeatKey(t.repeat))) reps.push([repeatKey(t.repeat), 'Personalizada (atual)']);
  const rems = [['', 'Sem lembrete'], [0, 'Na hora'], [10, '10 min antes'], [30, '30 min antes'], [60, '1 hora antes'], [1440, '1 dia antes']];
  if (t.remind != null && !rems.some(r => r[0] === t.remind)) rems.push([t.remind, `${t.remind} min antes`]);
  const places = [['|', 'Entrada'], ...of('section').filter(s => !byId(s.projectId)).map(s => ['|' + s.id, 'Entrada / ' + s.name]),
    ...of('project').flatMap(p => [[p.id + '|', p.name], ...of('section').filter(s => s.projectId === p.id).map(s => [p.id + '|' + s.id, p.name + ' / ' + s.name])])];
  const pid = byId(t.projectId) ? t.projectId : '', sid = byId(t.sectionId) ? t.sectionId : '';
  const subs = tasks().filter(s => s.parentId === id);
  modal(`<input name="title" value="${esc(t.title)}" required><textarea name="notes" placeholder="Descrição">${esc(t.notes || '')}</textarea>
    <div class="grid"><label>Data<input type="date" name="due" value="${esc(t.due || '')}"></label><label>Hora<input type="time" name="time" value="${esc(t.time || '')}"></label>
    <label>Prioridade<select name="priority">${[1, 2, 3, 4].map(n => opt(n, 'P' + n, t.priority || 4)).join('')}</select></label>
    <label>Local<select name="place">${places.map(p => opt(p[0], p[1], pid + '|' + sid)).join('')}</select></label>
    <label>Repetição<select name="repeat">${reps.map(r => opt(r[0], r[1], repeatKey(t.repeat))).join('')}</select></label>
    <label>Lembrete<select name="remind">${rems.map(r => opt(r[0], r[1], t.remind ?? '')).join('')}</select></label></div>
    <label>Etiquetas (separadas por vírgula)<input name="labels" value="${esc((t.labels || []).join(', '))}"></label>
    <p class="hint">Lembrete sem hora definida toca às 09:00.</p>
    <h4>Subtarefas</h4>${subs.map(s => `<div class="sub"><button type="button" data-sub="${esc(s.id)}">${s.done ? '✅' : '⬜'}</button><a data-goto="${esc(s.id)}">${esc(s.title)}</a></div>`).join('')}
    <input name="newsub" placeholder="＋ Adicionar subtarefa (salve para criar)">
    <button type="button" class="danger" data-del>Excluir tarefa</button>`, f => {
    const [projectId, sectionId] = f.get('place').split('|');
    const key = f.get('repeat');
    let repeat = null;
    if (key) { const [unit, n] = key.split(':'); repeat = key === repeatKey(t.repeat) ? t.repeat : { unit, n: +n }; }
    let due = f.get('due'); if (repeat && !due) due = today();
    const remind = f.get('remind') === '' ? null : +f.get('remind');
    const title = f.get('title').trim(); if (!title) return false;
    put(id, { title, notes: f.get('notes'), due, time: due ? f.get('time') : '', priority: +f.get('priority'), projectId, sectionId, repeat, remind,
      labels: [...new Set(f.get('labels').split(',').map(x => x.trim().replace(/^@/, '')).filter(Boolean))] });
    const moved = descendants(id).map(s => ({ id: s.id, data: { projectId, sectionId } }));
    if (moved.length) write(moved);
    const ns = f.get('newsub').trim();
    if (ns) create('task', { title: ns, parentId: id, projectId, sectionId, priority: 4, due: '', time: '', repeat: null, remind: null, labels: [], notes: '', done: false });
    if (remind !== null && due) askPermission().then(() => schedule(tasks()));
  });
  dlg.querySelector('[data-del]').onclick = () => {
    const all = [t, ...descendants(id)].map(x => ({ ...x }));
    write(all.map(x => ({ id: x.id, data: null }))); dlg.close();
    toast('Tarefa excluída', () => write(all.map(x => ({ id: x.id, data: x }))));
  };
  dlg.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { const s = byId(b.dataset.sub); const done = !s.done; put(s.id, { done, doneAt: done ? new Date().toISOString() : '' }); b.textContent = done ? '✅' : '⬜'; });
  dlg.querySelectorAll('[data-goto]').forEach(a => a.onclick = () => editTask(a.dataset.goto));
}

function projectDialog(p) {
  const blocked = p ? new Set([p.id]) : new Set();
  for (let grew = true; grew;) { grew = false; for (const x of of('project')) if (blocked.has(x.parentId) && !blocked.has(x.id)) { blocked.add(x.id); grew = true; } }
  modal(`<h2>${p ? 'Editar' : 'Novo'} projeto</h2><input name="name" placeholder="Nome" value="${esc(p?.name || '')}" required>
    <label>Cor<select name="color">${['Verde-azulado', 'Azul', 'Roxo', 'Âmbar', 'Rosa', 'Verde', 'Cinza'].map((n, i) => opt(COLORS[i], n, p?.color)).join('')}</select></label>
    <label>Dentro de<select name="parent">${opt('', 'Nenhum', '')}${of('project').filter(x => !blocked.has(x.id)).map(x => opt(x.id, x.name, p?.parentId)).join('')}</select></label>`, f => {
    const data = { name: f.get('name').trim(), color: f.get('color'), parentId: f.get('parent') };
    if (!data.name) return false;
    if (p) put(p.id, data); else view = { type: 'project', id: create('project', data) };
    render();
  });
}
function nameDialog(title, value, save) {
  modal(`<h2>${title}</h2><input name="name" value="${esc(value)}" required>`, f => { const n = f.get('name').trim(); if (!n) return false; save(n); });
}
function filterDialog(x) {
  modal(`<h2>${x ? 'Editar' : 'Novo'} filtro</h2><input name="name" placeholder="Nome" value="${esc(x?.name || '')}" required>
    <input name="query" placeholder="p1 & 7 dias" value="${esc(x?.query || '')}" required>
    <p class="hint">Termos: hoje, amanhã, atrasadas, sem data, 7 dias, recorrentes, p1, #Projeto, @etiqueta ou texto.<br>& = e · | = ou · ! = não (sem parênteses)</p>`, f => {
    const data = { name: f.get('name').trim(), query: f.get('query').trim() };
    if (x) put(x.id, data); else view = { type: 'filter', id: create('filter', data) };
    render();
  });
}

/* ---------- eventos ---------- */
const closeMenu = () => document.body.classList.remove('menu');
document.addEventListener('click', e => {
  if (e.target.closest('#dlg')) return;
  if (e.target.id === 'shade') return closeMenu();
  const el = e.target.closest('[data-toggle],[data-open],[data-view],[data-layout],[data-act]');
  if (!el) return;
  const d = el.dataset;
  if (d.toggle) return toggle(byId(d.toggle));
  if (d.open) return editTask(d.open);
  if (d.view) { view = { type: d.view, id: d.id || undefined }; if (d.view === 'search') search = ''; closeMenu(); return render(); }
  if (d.layout) { layout[view.type === 'upcoming' ? 'upcoming' : view.id || ''] = d.layout; return render(); }
  const pid = view.type === 'project' ? view.id : '';
  const a = d.act;
  if (a === 'menu') document.body.classList.toggle('menu');
  if (a === 'add') { closeMenu(); quickAdd(d.section || ''); }
  if (a === 'new-project') projectDialog();
  if (a === 'edit-project') projectDialog(byId(view.id));
  if (a === 'del-project' && confirm('Excluir este projeto e todas as tarefas dele? Os subprojetos sobem um nível.')) {
    const p = byId(view.id);
    write([...items.filter(i => i.projectId === p.id).map(i => ({ id: i.id, data: null })),
      ...of('project').filter(c => c.parentId === p.id).map(c => ({ id: c.id, data: { parentId: p.parentId || '' } })), { id: p.id, data: null }]);
  }
  if (a === 'new-section') nameDialog('Nova seção', '', name => create('section', { name, projectId: pid }));
  if (a === 'rename-section') nameDialog('Renomear seção', byId(d.id).name, name => put(d.id, { name }));
  if (a === 'del-section' && confirm('Excluir a seção? As tarefas dela serão mantidas.'))
    write([...tasks().filter(t => t.sectionId === d.id).map(t => ({ id: t.id, data: { sectionId: '' } })), { id: d.id, data: null }]);
  if (a === 'new-filter') filterDialog();
  if (a === 'edit-filter') filterDialog(byId(view.id));
  if (a === 'del-filter' && confirm('Excluir este filtro?')) put(view.id, null);
  if (a === 'prev' || a === 'next') { month = new Date(month.getFullYear(), month.getMonth() + (a === 'next' ? 1 : -1), 1); render(); }
  if (a === 'perm') askPermission().then(ok => { toast(ok ? 'Notificações permitidas' : 'Permissão negada ou indisponível'); if (ok) schedule(tasks()); });
  if (a === 'logout') { schedule([]); S.logout(); }
  if (a === 'export') {
    const json = JSON.stringify(items, null, 2);
    if (Capacitor.isNativePlatform()) toast('Exporte a cópia pela versão do PC');
    else { const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); l.download = `pauta-${today()}.json`; l.click(); }
  }
});
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'q' && !e.ctrlKey && !e.metaKey && !e.altKey && user && !dlg.open && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); quickAdd(); }
});
// arrastar (PC): entre colunas do quadro, seções e dias
document.addEventListener('dragstart', e => { const t = e.target.closest?.('[data-open]'); if (t) e.dataTransfer.setData('text/plain', t.dataset.open); });
document.addEventListener('dragover', e => { if (e.target.closest?.('[data-day],[data-section]')) e.preventDefault(); });
document.addEventListener('drop', e => {
  const target = e.target.closest?.('[data-day],section[data-section]'); if (!target) return;
  e.preventDefault();
  const t = byId(e.dataTransfer.getData('text/plain')); if (!t) return;
  if (target.dataset.day) put(t.id, { due: target.dataset.day });
  else write([t, ...descendants(t.id)].map(x => ({ id: x.id, data: { sectionId: target.dataset.section } })));
});

if (Capacitor.isNativePlatform()) CapApp.addListener('backButton', () => {
  if (dlg.open) dlg.close(); else if (document.body.classList.contains('menu')) closeMenu();
  else if (view.type !== 'today') { view = { type: 'today' }; render(); } else CapApp.minimizeApp();
});

/* ---------- início ---------- */
const authBox = $('#auth');
$('#authform').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target), mode = e.submitter?.value || 'login';
  $('#autherr').textContent = '';
  try {
    if (mode === 'reset') { await S.reset(f.get('email')); $('#autherr').textContent = 'Se a conta existir, você receberá um e-mail.'; }
    else await (mode === 'register' ? S.register : S.login)(f.get('email'), f.get('password'));
  } catch (err) { $('#autherr').textContent = 'Não foi possível: ' + (err.code || err.message); }
};
write = S.start({
  onUser: u => {
    user = u; if (!u) { items = []; dlg.open && dlg.close(); }
    authBox.hidden = !!u; $('#app').hidden = !u; render();
  },
  onData: (list, st) => { items = list; status = st; render(); schedule(tasks()); },
  onError: e => { console.error(e); toast('Erro: ' + (e.code || e.message)); }
});
// virada do dia e reprogramação dos lembretes
let lastDay = today();
setInterval(() => { if (today() !== lastDay) { lastDay = today(); render(); } }, 60000);
setInterval(() => schedule(tasks()), 36e5);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); schedule(tasks()); } });
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
