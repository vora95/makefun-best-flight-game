// input.js — keyboard + mouse, in one place.
//
// Keys: W/S pitch, A/D bank, Shift/Ctrl (or ArrowUp/ArrowDown) throttle,
// Space airbrake, C camera, P pause, R restart, M mute. The mouse steers
// gently: its offset from the screen centre adds roll and pitch while
// the pointer is over the game. Mouse input is low-pass filtered so a
// jittery hand does not shake the plane.
export function createInput() {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered keys, consumed by the game
  const mouse = { x: 0, y: 0, smoothX: 0, smoothY: 0, active: false, lastMove: 0 };

  // One table drives both listeners: code -> held action.
  const BINDINGS = {
    KeyW: 'pitchUp', ArrowUp: 'throttleUp',
    KeyS: 'pitchDown', ArrowDown: 'throttleDown',
    KeyA: 'rollLeft', KeyD: 'rollRight',
    ShiftLeft: 'throttleUp', ShiftRight: 'throttleUp',
    ControlLeft: 'throttleDown', ControlRight: 'throttleDown',
    Space: 'brake',
  };
  // Keys that fire once per press, not while held.
  const EDGE_KEYS = ['KeyC', 'KeyP', 'KeyR', 'KeyM', 'Enter'];
  const MOUSE_IDLE_MS = 2500; // stop steering this long after the mouse stops
  const MOUSE_DEADZONE = 0.08;
  const MOUSE_SMOOTHING = 0.12; // low-pass factor per read

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    const action = BINDINGS[e.code];
    if (action) keys.add(action);
    if (EDGE_KEYS.includes(e.code) && !e.repeat) pressed.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    const action = BINDINGS[e.code];
    if (action) keys.delete(action);
  });
  window.addEventListener('blur', () => keys.clear());

  window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    mouse.active = true;
    mouse.lastMove = performance.now();
  });
  window.addEventListener('mouseleave', () => { mouse.active = false; });

  function mouseSteering() {
    // Low-pass the raw offsets, then apply a dead zone around centre.
    mouse.smoothX += (mouse.x - mouse.smoothX) * MOUSE_SMOOTHING;
    mouse.smoothY += (mouse.y - mouse.smoothY) * MOUSE_SMOOTHING;
    if (!mouse.active || performance.now() - mouse.lastMove > MOUSE_IDLE_MS) {
      return { pitch: 0, roll: 0 };
    }
    return {
      roll: Math.abs(mouse.smoothX) > MOUSE_DEADZONE ? mouse.smoothX * 0.7 : 0,
      pitch: Math.abs(mouse.smoothY) > MOUSE_DEADZONE ? -mouse.smoothY * 0.55 : 0,
    };
  }

  // Read the current control state: returns { pitch, roll, throttleDelta, brake }.
  function read() {
    let pitch = 0, roll = 0, throttleDelta = 0;
    if (keys.has('pitchUp')) pitch += 1;    // W: nose up (pull)
    if (keys.has('pitchDown')) pitch -= 1;  // S: nose down
    if (keys.has('rollLeft')) roll -= 1;
    if (keys.has('rollRight')) roll += 1;
    if (keys.has('throttleUp')) throttleDelta += 1;
    if (keys.has('throttleDown')) throttleDelta -= 1;
    const steer = mouseSteering();
    pitch += steer.pitch;
    roll += steer.roll;
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
