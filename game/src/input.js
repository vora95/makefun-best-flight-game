// input.js — keyboard + mouse, in one place.
// Keys: W/S pitch, A/D bank, Shift/Ctrl (or ArrowUp/ArrowDown) throttle,
// Space airbrake, C camera, P pause, R restart, M mute.
// The mouse steers gently: its offset from the screen centre adds roll
// and pitch while the pointer is over the game.
export function createInput() {
  const keys = new Set();
  const mouse = { x: 0, y: 0, active: false, lastMove: 0 };
  const pressed = new Set(); // edge-triggered keys, consumed by the game

  const KEYMAP = {
    KeyW: 'pitchUp', ArrowUp: 'throttleUp',
    KeyS: 'pitchDown', ArrowDown: 'throttleDown',
    KeyA: 'rollLeft', KeyD: 'rollRight',
    ShiftLeft: 'throttleUp', ShiftRight: 'throttleUp',
    ControlLeft: 'throttleDown', ControlRight: 'throttleDown',
    Space: 'brake',
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (KEYMAP[e.code]) keys.add(KEYMAP[e.code]);
    if (['KeyC', 'KeyP', 'KeyR', 'KeyM', 'Enter'].includes(e.code) && !e.repeat) {
      pressed.add(e.code);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]);
  });
  window.addEventListener('blur', () => keys.clear());

  window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    mouse.active = true;
    mouse.lastMove = performance.now();
  });
  window.addEventListener('mouseleave', () => { mouse.active = false; });

  // Read the current control state: returns { pitch, roll, throttleDelta, brake }.
  function read() {
    let pitch = 0, roll = 0, throttleDelta = 0;
    if (keys.has('pitchUp')) pitch += 1;    // W: nose up (pull)
    if (keys.has('pitchDown')) pitch -= 1;  // S: nose down
    if (keys.has('rollLeft')) roll -= 1;
    if (keys.has('rollRight')) roll += 1;
    if (keys.has('throttleUp')) throttleDelta += 1;
    if (keys.has('throttleDown')) throttleDelta -= 1;
    if (mouse.active && performance.now() - mouse.lastMove < 2500) {
      // Gentle mouse steering: centre of the screen is neutral.
      if (Math.abs(mouse.x) > 0.08) roll += mouse.x * 0.7;
      if (Math.abs(mouse.y) > 0.08) pitch -= mouse.y * 0.55;
    }
    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      throttleDelta,
      brake: keys.has('brake'),
    };
  }

  function consume(code) {
    if (pressed.has(code)) { pressed.delete(code); return true; }
    return false;
  }

  return { read, consume, keys };
}
