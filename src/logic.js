// Regras puras (datas, adição rápida, filtros) — sem DOM, para poder testar.
export const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const WEEK = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const WD = '(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?';

function nextWeekday(base, wd, allowToday) {
  let diff = (wd - base.getDay() + 7) % 7;
  if (!diff && !allowToday) diff = 7;
  return addDays(base, diff);
}
function addMonths(d, n, day) {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day || d.getDate(), last));
}
function validDate(y, m, d) {
  const x = new Date(y, m - 1, d);
  return x.getMonth() === m - 1 && x.getDate() === d ? x : null;
}

/** repeat = {unit:'day'|'week'|'month'|'year'|'weekday', n, day?} */
export function nextOccurrence(due, repeat, today = new Date()) {
  const t = iso(today);
  let d = fromIso(due);
  const anchor = repeat.day || d.getDate();
  let k = 0;
  const base = d;
  do {
    k++;
    if (repeat.unit === 'day') d = addDays(base, k * repeat.n);
    else if (repeat.unit === 'week') d = addDays(base, 7 * k * repeat.n);
    else if (repeat.unit === 'month') d = addMonths(base, k * repeat.n, anchor);
    else if (repeat.unit === 'year') d = addMonths(base, 12 * k * repeat.n, anchor);
    else { do { d = addDays(d, 1); } while (d.getDay() === 0 || d.getDay() === 6); }
  } while (iso(d) < t);
  return iso(d);
}

/** Interpreta a adição rápida em português. */
export function parseQuick(text, today = new Date()) {
  const out = { due: '', time: '', repeat: null, priority: 4, project: '', labels: [], remind: null };
  let raw = ' ' + text.normalize('NFC') + ' ';
  // versão sem acentos com o mesmo comprimento, para as posições baterem
  let flat = Array.from(raw, c => { const n = norm(c); return n.length === c.length ? n : c; }).join('');
  const take = (re, fn) => {
    const m = re.exec(flat);
    if (!m) return false;
    const orig = raw.substr(m.index, m[0].length);
    if (fn(m, orig) === false) return false;
    const blank = ' ';
    raw = raw.slice(0, m.index) + blank + raw.slice(m.index + m[0].length);
    flat = flat.slice(0, m.index) + blank + flat.slice(m.index + m[0].length);
    return true;
  };
  const E = '(?=[\\s,.;]|$)';
  take(new RegExp('\\sp([1-4])' + E), m => { out.priority = +m[1]; });
  take(/\s#([^\s#@]+)/, (m, o) => { out.project = o.trim().slice(1).replace(/_/g, ' '); });
  while (take(/\s@([^\s#@]+)/, (m, o) => { out.labels.push(o.trim().slice(1)); }));
  take(new RegExp('\\s!(\\d+)\\s?(min|h|d)?' + E), m => { out.remind = +m[1] * ({ h: 60, d: 1440 }[m[2]] || 1); });

  let d = null;
  take(new RegExp('\\s(?:todo dia util|todos os dias uteis|dias uteis)' + E), () => {
    out.repeat = { unit: 'weekday', n: 1 };
    d = today; while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
  }) ||
  take(new RegExp('\\stod[ao]s?(?: as| os)? ' + WD + 's?' + E), m => { out.repeat = { unit: 'week', n: 1 }; d = nextWeekday(today, WEEK[m[1]], true); }) ||
  take(new RegExp('\\stodo dia (\\d{1,2})' + E), m => {
    const day = +m[1]; if (day < 1 || day > 31) return false;
    out.repeat = { unit: 'month', n: 1, day };
    d = addMonths(today, 0, day); if (iso(d) < iso(today)) d = addMonths(today, 1, day);
  }) ||
  take(new RegExp('\\sa cada (\\d+) (dias?|semanas?|mes(?:es)?|anos?)' + E), m => {
    if (+m[1] < 1) return false;
    out.repeat = { unit: m[2][0] === 'd' ? 'day' : m[2][0] === 's' ? 'week' : m[2][0] === 'm' ? 'month' : 'year', n: +m[1] };
  }) ||
  take(new RegExp('\\s(todo dia|todos os dias|diariamente|toda semana|semanalmente|todo mes|mensalmente|todo ano|anualmente)' + E), m => {
    const s = m[1];
    out.repeat = { unit: /dia|diaria/.test(s) ? 'day' : /seman/.test(s) ? 'week' : /mes|mensal/.test(s) ? 'month' : 'year', n: 1 };
  });

  take(new RegExp('\\sdepois de amanha' + E), () => { d = addDays(today, 2); }) ||
  take(new RegExp('\\s(hoje|amanha)' + E), m => { d = addDays(today, m[1] === 'hoje' ? 0 : 1); }) ||
  take(new RegExp('\\sem (\\d+) (dias?|semanas?)' + E), m => { d = addDays(today, +m[1] * (m[2][0] === 's' ? 7 : 1)); }) ||
  take(new RegExp('\\s(?:dia )?(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}))?' + E), m => {
    let x = validDate(m[3] ? +m[3] : today.getFullYear(), +m[2], +m[1]);
    if (!x) return false;
    if (!m[3] && iso(x) < iso(today)) x = validDate(today.getFullYear() + 1, +m[2], +m[1]) || x;
    d = x;
  }) ||
  take(new RegExp('\\sdia (\\d{1,2})' + E), m => {
    const day = +m[1]; if (day < 1 || day > 31) return false;
    d = addMonths(today, 0, day); if (iso(d) < iso(today)) d = addMonths(today, 1, day);
  }) ||
  // "segunda"/"quarta" sozinhas são ambíguas ("segunda via"): exigem na/próxima/-feira
  take(new RegExp('\\s(?:(?:na |no )?proxim[ao] |na |no )' + WD + E), m => { d = nextWeekday(today, WEEK[m[1]], false); }) ||
  take(new RegExp('\\s(domingo|sabado|(?:segunda|terca|quarta|quinta|sexta)-feira)' + E), m => { d = nextWeekday(today, WEEK[m[1].split('-')[0]], false); });

  take(new RegExp('\\s(?:as )?([01]?\\d|2[0-3])(?::([0-5]\\d)|h([0-5]\\d)?)' + E), m => { out.time = `${pad(m[1])}:${m[2] || m[3] || '00'}`; }) ||
  take(new RegExp('\\sas ([01]?\\d|2[0-3])(?=\\s*$|\\s+(?:p[1-4]|[#@!]))'), m => { out.time = `${pad(m[1])}:00`; });

  if (!d && (out.repeat || out.time)) d = today;
  if (d) out.due = iso(d);
  if (out.time && out.remind === null) out.remind = 0;
  out.title = raw.replace(/\s+/g, ' ').trim();
  return out;
}

/** Filtros: hoje, atrasadas, sem data, 7 dias, p1..p4, #Projeto, @etiqueta, texto; & (e), | (ou), ! (não) */
export function matchFilter(task, query, ctx) {
  const today = ctx.today || iso(new Date());
  const term = q => {
    q = q.trim();
    if (q.startsWith('!')) return !term(q.slice(1));
    const n = norm(q);
    if (!n) return false;
    if (n === 'hoje') return task.due === today;
    if (n === 'amanha') return task.due === iso(addDays(fromIso(today), 1));
    if (n === 'atrasadas') return !!task.due && task.due < today;
    if (n === 'sem data') return !task.due;
    if (n === 'recorrentes') return !!task.repeat;
    const dm = /^(\d+) dias$/.exec(n);
    if (dm) return !!task.due && task.due >= today && task.due < iso(addDays(fromIso(today), +dm[1]));
    if (/^p[1-4]$/.test(n)) return (task.priority || 4) === +n[1];
    if (n[0] === '#') return norm(ctx.projectName(task.projectId)) === n.slice(1).replace(/_/g, ' ');
    if (n[0] === '@') return (task.labels || []).some(l => norm(l) === n.slice(1));
    return norm(task.title + ' ' + (task.notes || '')).includes(n);
  };
  return query.split('|').some(part => part.split('&').every(term));
}

export function reminderAt(task) {
  if (task.done || !task.due || task.remind === null || task.remind === undefined) return null;
  const d = fromIso(task.due);
  const [h, m] = (task.time || '09:00').split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return new Date(d.getTime() - task.remind * 60000);
}
