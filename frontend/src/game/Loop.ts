// State machine for loop boundary definition: Off → Start (pick start)
// → End (pick end) → Off (loop active).

export enum LoopDefinitionState {
  Off = 'off',
  Start = 'start',
  End = 'end',
}
