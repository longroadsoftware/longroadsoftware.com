export const input = {
  keys: new Set(), pressed: new Set(),
  mdx: 0, mdy: 0, wheel: 0,
  lmb: false, rmb: false, lclick: false, rclick: false,
  locked: false, canvas: null,
};

export function initInput(canvas) {
  input.canvas = canvas;
  addEventListener('keydown', (e) => {
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    input.keys.add(e.code);
    input.pressed.add(e.code);
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => { input.keys.clear(); input.lmb = input.rmb = false; });
  addEventListener('mousemove', (e) => {
    if (input.locked) { input.mdx += e.movementX; input.mdy += e.movementY; }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { input.lmb = true; input.lclick = true; }
    if (e.button === 2) { input.rmb = true; input.rclick = true; }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) input.lmb = false;
    if (e.button === 2) input.rmb = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('wheel', (e) => { input.wheel += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
}

export function lockPointer() {
  try { const p = input.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* headless */ }
}
export function unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }

export const pressed = (code) => input.pressed.has(code);
export const held = (code) => input.keys.has(code);

export function endFrame() {
  input.pressed.clear();
  input.lclick = input.rclick = false;
  input.mdx = input.mdy = 0;
  input.wheel = 0;
}
