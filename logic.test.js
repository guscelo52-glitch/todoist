import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick, nextOccurrence, matchFilter, reminderAt } from './src/logic.js';
const T = new Date(2026, 10, 27); // sexta-feira
const p = s => parseQuick(s, T);
test('adição rápida completa', () => {
  const r = p('Corrigir provas amanhã às 14h p1 #Aulas @escola !30min');
  assert.deepEqual([r.title, r.due, r.time, r.priority, r.project, r.labels, r.remind], ['Corrigir provas', '2026-11-28', '14:00', 1, 'Aulas', ['escola'], 30]);
});
test('datas', () => {
  assert.equal(p('x hoje').due, '2026-11-27');
  assert.equal(p('x depois de amanhã').due, '2026-11-29');
  assert.equal(p('x na sexta').due, '2026-12-04');
  assert.equal(p('x segunda-feira').due, '2026-11-30');
  assert.equal(p('x 15/01').due, '2027-01-15');
  assert.equal(p('x dia 5').due, '2026-12-05');
  assert.equal(p('x em 2 semanas').due, '2026-12-11');
  assert.equal(p('x 9:30').time, '09:30');
});
test('não confunde texto comum', () => {
  for (const s of ['Pedir segunda via', 'Ler as 3 apostilas hojeee', 'Nota 31/02']) {
    const r = p(s); assert.equal(r.title, s); assert.equal(r.time, '');
  }
  assert.equal(p('Pedir segunda via').due, '');
  assert.equal(p('Nota 31/02').due, '');
});
test('recorrência', () => {
  assert.deepEqual(p('x toda sexta').repeat, { unit: 'week', n: 1 });
  assert.equal(p('x toda sexta').due, '2026-11-27');
  assert.equal(p('x todo dia 10').due, '2026-12-10');
  assert.equal(nextOccurrence('2026-11-27', { unit: 'week', n: 1 }, T), '2026-12-04');
  assert.equal(nextOccurrence('2026-11-27', { unit: 'weekday', n: 1 }, T), '2026-11-30');
  assert.equal(nextOccurrence('2027-01-31', { unit: 'month', n: 1, day: 31 }, T), '2027-02-28');
  assert.equal(nextOccurrence('2027-02-28', { unit: 'month', n: 1, day: 31 }, T), '2027-03-31');
});
test('filtros', () => {
  const t = { title: 'Prova', due: '2026-11-27', priority: 1, projectId: 'a', labels: ['escola'] };
  const c = { today: '2026-11-27', projectName: () => 'Aulas' };
  assert.ok(matchFilter(t, 'hoje & p1 & #aulas & @escola', c));
  assert.ok(matchFilter(t, 'atrasadas | 7 dias', c));
  assert.ok(!matchFilter(t, '!p1', c));
});
test('lembrete', () => {
  assert.equal(reminderAt({ due: '2026-11-27', time: '14:00', remind: 30 }).getTime(), new Date(2026, 10, 27, 13, 30).getTime());
  assert.equal(reminderAt({ due: '2026-11-27', remind: null }), null);
});
