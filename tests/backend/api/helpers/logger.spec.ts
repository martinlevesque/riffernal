import { afterAll, afterEach, expect, spyOn, test } from 'bun:test';
import { errDetails, logger } from '../../../../backend/api/helpers/logger.ts';

const originalLevel = process.env.LOG_LEVEL;

const logSpy = spyOn(console, 'log').mockImplementation(() => {});
const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

afterAll(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

afterEach(() => {
  if (originalLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = originalLevel;
  }
  logSpy.mockClear();
  errorSpy.mockClear();
});

test('logger logs info at the default level', () => {
  logger.info('hello');

  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy.mock.calls[0][0]).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z INFO hello$/,
  );
});

test('logger suppresses debug at the default level', () => {
  logger.debug('noisy');

  expect(logSpy).not.toHaveBeenCalled();
});

test('logger emits debug when LOG_LEVEL=debug', () => {
  process.env.LOG_LEVEL = 'debug';

  logger.debug('noisy');

  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy.mock.calls[0][0]).toContain('DEBUG noisy');
});

test('logger suppresses info when LOG_LEVEL=error', () => {
  process.env.LOG_LEVEL = 'error';

  logger.info('hello');

  expect(logSpy).not.toHaveBeenCalled();
});

test('logger falls back to info for an unknown LOG_LEVEL', () => {
  process.env.LOG_LEVEL = 'verbose';

  logger.debug('noisy');
  logger.info('hello');

  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy.mock.calls[0][0]).toContain('INFO hello');
});

test('logger sends errors to stderr at any level', () => {
  process.env.LOG_LEVEL = 'error';

  logger.error('boom');

  expect(errorSpy).toHaveBeenCalledTimes(1);
  expect(errorSpy.mock.calls[0][0]).toContain('ERROR boom');
  expect(logSpy).not.toHaveBeenCalled();
});

test('errDetails returns the stack for Error instances', () => {
  const details = errDetails(new Error('kaboom'));

  expect(details).toContain('kaboom');
  expect(details).toContain('Error');
});

test('errDetails stringifies non-Error values', () => {
  expect(errDetails('oops')).toBe('oops');
});
