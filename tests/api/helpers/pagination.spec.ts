import { test, expect } from 'bun:test';
import { parsePagination, DEFAULT_LIMIT } from '../../../backend/api/helpers/pagination.ts';

test('parsePagination returns defaults when no params are present', () => {
  const url = new URL('http://localhost/api/community/songs');

  expect(parsePagination(url)).toEqual({ limit: DEFAULT_LIMIT, offset: 0 });
});

test('parsePagination passes through valid limit and offset', () => {
  const url = new URL('http://localhost/api/community/songs?limit=5&offset=20');

  expect(parsePagination(url)).toEqual({ limit: 5, offset: 20 });
});

test('parsePagination clamps limit to 100', () => {
  const url = new URL('http://localhost/api/community/songs?limit=150');

  expect(parsePagination(url).limit).toBe(100);
});

test('parsePagination clamps a negative limit to 1', () => {
  const url = new URL('http://localhost/api/community/songs?limit=-5');

  expect(parsePagination(url).limit).toBe(1);
});

test('parsePagination falls back to the default limit for zero (falsy), non-numeric, and empty values', () => {
  const zero = new URL('http://localhost/api/community/songs?limit=0');
  expect(parsePagination(zero).limit).toBe(DEFAULT_LIMIT);

  const nan = new URL('http://localhost/api/community/songs?limit=abc');
  expect(parsePagination(nan).limit).toBe(DEFAULT_LIMIT);

  const empty = new URL('http://localhost/api/community/songs?limit=');
  expect(parsePagination(empty).limit).toBe(DEFAULT_LIMIT);
});

test('parsePagination clamps a negative offset to 0', () => {
  const url = new URL('http://localhost/api/community/songs?offset=-10');

  expect(parsePagination(url).offset).toBe(0);
});

test('parsePagination falls back to offset 0 for non-numeric and empty values', () => {
  const nan = new URL('http://localhost/api/community/songs?offset=abc');
  expect(parsePagination(nan).offset).toBe(0);

  const empty = new URL('http://localhost/api/community/songs?offset=');
  expect(parsePagination(empty).offset).toBe(0);
});

test('parsePagination honors a custom defaultLimit when the limit param is absent', () => {
  const url = new URL('http://localhost/api/community/songs');

  expect(parsePagination(url, 25).limit).toBe(25);
});

test('parsePagination lets an explicit limit override a custom defaultLimit', () => {
  const url = new URL('http://localhost/api/community/songs?limit=3');

  expect(parsePagination(url, 25).limit).toBe(3);
});
