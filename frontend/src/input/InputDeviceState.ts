import { InputDeviceType } from './types.js';

export class InputDeviceState {
  private _type: InputDeviceType;
  onTypeChange: ((type: InputDeviceType, message: string) => void) | null = null;

  constructor(initial: InputDeviceType = InputDeviceType.ComputerKeyboard) {
    this._type = initial;
  }

  get type(): InputDeviceType {
    return this._type;
  }

  setType(type: InputDeviceType, message: string): void {
    if (this._type === type) return;

    this._type = type;
    this.onTypeChange?.(type, message);
  }
}
