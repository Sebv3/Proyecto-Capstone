import assert from 'node:assert/strict';
import test from 'node:test';
import { appendUniqueById, shareChatSnapshot } from '../src/services/listData.ts';

const message = (id, extra = {}) => ({ id, conversacion_id: 'conversation', autor_id: 'client', contenido: `Mensaje ${id}`,
  creado_en: '2030-01-01T12:00:00Z', editado_en: null, ...extra });

test('overlapping pages append once in server order and retain existing rows', () => {
  const first = { id: '1' }, second = { id: '2' };
  const original = [first];
  assert.deepEqual(appendUniqueById(original, [first, second, second]), [first, second]);
  assert.equal(appendUniqueById(original, [first]), original);
  assert.equal(appendUniqueById(original, []), original);
  assert.deepEqual(original, [first]);
});

test('unchanged polling preserves the array and message objects even after JSON decoding', () => {
  const loaded = Array.from({ length: 5000 }, (_, index) => message(String(index)));
  assert.equal(shareChatSnapshot(loaded, JSON.parse(JSON.stringify(loaded))), loaded);
});

test('editing one message invalidates only that row and applies provider fields', () => {
  const previous = [message('1'), message('2'), message('3')];
  const changed = previous.map((item) => ({ ...item }));
  changed[1] = { ...changed[1], contenido: 'Editado', editado_en: '2030-01-01T12:01:00Z' };
  const result = shareChatSnapshot(previous, changed);
  assert.notEqual(result, previous);
  assert.equal(result[0], previous[0]);
  assert.equal(result[2], previous[2]);
  assert.equal(result[1], changed[1]);
  assert.equal(previous[1].contenido, 'Mensaje 2');
});

test('authoritative deletion removes messages; server order is preserved and IDs deduplicate', () => {
  const first = message('1'), second = message('2');
  assert.deepEqual(shareChatSnapshot([first, second], [second, second]), [second]);
  assert.deepEqual(shareChatSnapshot([first, second], []), []);
  assert.deepEqual(shareChatSnapshot([first, second], [second, first]), [second, first]);
});

test('changes to author, timestamp or conversation never reuse a stale message', () => {
  const item = message('1');
  for (const changed of [{ autor_id: 'worker' }, { creado_en: '2030-01-02T12:00:00Z' }, { conversacion_id: 'other' }]) {
    const result = shareChatSnapshot([item], [{ ...item, ...changed }]);
    assert.notEqual(result[0], item);
    assert.deepEqual(result[0], { ...item, ...changed });
  }
});
