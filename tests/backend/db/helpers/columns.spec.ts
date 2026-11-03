import { test, expect } from 'bun:test';
import { columns } from '../../../../backend/db/helpers/columns.ts';

test('columns joins names with commas', () => {
  expect(columns(['id', 'name'])).toBe('id, name');
});

test('columns returns a single column', () => {
  expect(columns(['id'])).toBe('id');
});

test('columns prefixes with table alias', () => {
  expect(columns(['id', 'name'], 's')).toBe('s.id, s.name');
});

test('columns with single column and alias', () => {
  expect(columns(['id'], 't')).toBe('t.id');
});

test('columns handles many columns', () => {
  expect(columns(['a', 'b', 'c', 'd'])).toBe('a, b, c, d');
});
