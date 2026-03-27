// Handle wheel-based panning. 
export function panScreen(keys,mouse,zoom, panVlos, state){
    if (keys.held('Control')) return;

    // Use scroll() to capture vertical pan from touch gestures (two-finger pan)
    const wheelY = mouse.scroll();
    const wheelX = mouse.wheelX();

    const zoomX = zoom.x;
    const zoomY = zoom.y;

    let horiz = wheelX || 0;
    let vert = wheelY || 0;
    if (keys.held('Shift')) { // Shift = horizontal scroll (Standard UX)
        horiz += wheelY; 
        vert = 0;
    }
    if(mouse.held('middle')){
        horiz += (mouse.pos.x - mouse.prevPos.x);
        vert += (mouse.pos.y - mouse.prevPos.y);
    }
    // invert direction (so scrolling is correct direction)
    const impulseX = -horiz * (state.camera.panImpulse) * (1 / zoomX);
    const impulseY = -vert * (state.camera.panImpulse) * (1 / zoomY);
    panVlos.x += impulseX;
    panVlos.y += impulseY;
}