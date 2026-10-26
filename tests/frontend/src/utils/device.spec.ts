import { test, expect } from 'bun:test';
import { isLowEndDevice, setLowEndDeviceMode } from '../../../../frontend/src/utils/device.ts';

test('low-end device mode is disabled by default', () => {
  expect(isLowEndDevice()).toBe(false);
});

test('setLowEndDeviceMode toggles the mode and is read live', () => {
  setLowEndDeviceMode(true);
  expect(isLowEndDevice()).toBe(true);

  setLowEndDeviceMode(false);
  expect(isLowEndDevice()).toBe(false);
});
