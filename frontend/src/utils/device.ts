// Low-end device mode is a user setting (default off), not an
// auto-detected device tier. Rendering and audio consumers read the
// flag live, so toggling it in the settings popup applies without
// a reload.

let _lowEndMode = false;

export function isLowEndDevice(): boolean {
  return _lowEndMode;
}

export function setLowEndDeviceMode(enabled: boolean): void {
  _lowEndMode = enabled;
}
