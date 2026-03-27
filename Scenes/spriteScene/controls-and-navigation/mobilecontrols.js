export function _drawHeld(mouse,button, minHold = 0.05) {
    console.log(mouse)
    const isTouch =  ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    if (!isTouch) return mouse.held(button);
    const t = mouse.held(button, true);
    return !!(t && t >= minHold );
}