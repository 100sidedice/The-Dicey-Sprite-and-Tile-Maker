import Vector from '../Vector.js';
import UIButton from './Button.js';
import Signal from '../Signal.js';

export default class UITextInput extends UIButton {
    constructor(mouse, keys, pos, size, layer, text = '', placeholder = ''){
        super(mouse, keys, pos, size, layer, null, '#222', '#333', '#111');
        this.text = String(text || '');
        this.placeholder = String(placeholder || '');
        this.focused = false;
        this.onChange = new Signal();
        this.onSubmit = new Signal();
        this._blink = 0;
        this._caretVisible = true;
        this._maxLength = 64;
        this._passcodeToken = 'ui-textinput';
        this._savedPasscode = null;
        this._passcodeLocked = false;
        this._heldKeyLatch = new Set();
        this._leftMouseLatch = false;
    }

    focus(){
        this.focused = true;
        this._lockKeys();
        try{ if (this.mouse && typeof this.mouse.addMask === 'function') this.mouse.addMask(this.layer); } catch(e){}
    }
    // accept: when true, treat the blur as an accept/submit (e.g., click-away)
    blur(accept = false){
        // only emit submit when we were focused and caller intends to accept
        if (this.focused && accept){
            try{ this.onSubmit.emit(this.text); } catch(e){}
        }
        this.focused = false;
        this._heldKeyLatch.clear();
        this._unlockKeys();
    }

    _lockKeys(){
        if (!this.keys) return;
        try {
            // Capture prior passcode once when focus lock begins.
            if (!this._passcodeLocked) {
                this._savedPasscode = this.keys.passcode || '';
                this._passcodeLocked = true;
            }
            // Re-assert token while focused in case another system changed it.
            if (this.keys.passcode !== this._passcodeToken) {
                this.keys.setPasscode(this._passcodeToken);
            }
        } catch (e) {}
    }

    _unlockKeys(){
        if (!this.keys) { this._passcodeLocked = false; return; }
        if (!this._passcodeLocked) return;
        try {
            // Drop any queued presses/releases captured while locked so they don't
            // fire global shortcuts after we restore the passcode.
            if (typeof this.keys.clearState === 'function') this.keys.clearState();
            if (this.keys.passcode === this._passcodeToken) {
                const restore = (typeof this._savedPasscode === 'string') ? this._savedPasscode : '';
                this.keys.setPasscode(restore);
            }
        } catch (e) {}
        this._passcodeLocked = false;
        this._savedPasscode = null;
    }

    update(delta){
        // basic hover/pressed handling from UIButton
        super.update(delta);
        if(!this.visible){
            this._unlockKeys();
            return;
        }
        this._blink += delta;
        if (this._blink > 0.5) { this._blink = 0; this._caretVisible = !this._caretVisible; }

        const rectPos = this.pos.add(this.offset);
        const isInside = (()=>{
            if (!this.mouse || !this.mouse.pos) return false;
            const p = this.mouse.pos;
            return (p.x >= rectPos.x && p.y >= rectPos.y && p.x <= rectPos.x + this.size.x && p.y <= rectPos.y + this.size.y);
        })();

        // Keep key passcode while focused (and only while focused).
        if (this.focused) this._lockKeys();
        else this._unlockKeys();

        // single-click start (held-edge) to focus; resilient if pressed() edge is missed
        let leftHeld = false;
        try { leftHeld = !!(this.mouse && this.mouse.held && this.mouse.held('left')); } catch (e) { leftHeld = false; }
        const leftStart = leftHeld && !this._leftMouseLatch;
        this._leftMouseLatch = leftHeld;

        if (leftStart){
            // clicked inside?
            if (isInside){
                this.focus();
            } else {
                // click outside blurs and should accept the current text
                this.blur(true);
            }
        }

        if (!this.focused) return;

        let pressedKeys = [];
        let heldKeys = [];
        try {
            if (this.keys && typeof this.keys.getKeysPressed === 'function') {
                pressedKeys = this.keys.getKeysPressed(this._passcodeToken) || [];
            }
            if (this.keys && typeof this.keys.getKeysHeld === 'function') {
                heldKeys = this.keys.getKeysHeld(this._passcodeToken) || [];
            }
        } catch (e) { pressedKeys = []; }

        const edgeSet = new Set(pressedKeys);
        const heldSet = new Set(heldKeys);
        for (const k of heldSet) {
            if (!this._heldKeyLatch.has(k)) edgeSet.add(k);
        }
        this._heldKeyLatch = heldSet;

        // backspace / enter / escape
        try{
            if (edgeSet.has('Backspace')){
                if (this.text.length > 0){
                    this.text = this.text.slice(0, -1);
                    this.onChange.emit(this.text);
                }
            }
            if (edgeSet.has('Enter')){
                this.onSubmit.emit(this.text);
                this.blur(false);
            }
            if (edgeSet.has('Escape')){
                // Escape should simply blur without accepting
                this.blur(false);
            }
        } catch(e){}

        // handle printable characters: letters, numbers, space and common punctuation
        const allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_=[]{};:'\\\",.<>/?`~!@#$%^&*()+=\\|";
        const allowedSet = new Set(allowed.split(''));
        for (const ch of edgeSet){
            if (!allowedSet.has(ch)) continue;
            if (this.text.length >= this._maxLength) break;
            this.text += ch;
            this.onChange.emit(this.text);
        }
    }

    draw(UIDraw){
        if(!this.visible) return;
        // background
        UIDraw.rect(this.pos.add(this.offset), this.size, this.color);
        // border
        UIDraw.rect(this.pos.add(this.offset), this.size, '#00000000', false, true, 2, '#888888');
        // text
    const txt = (this.text.length > 0) ? this.text : this.placeholder;
    const color = (this.text.length > 0) ? '#FFFFFF' : '#AAAAAA';
    const textPos = this.pos.clone().add(this.offset).add(new Vector(8, this.size.y/2 + 6));
    // use monospace font when available
    UIDraw.text(txt, textPos, color, 0, 14, { align: 'left', baseline: 'middle', font: 'monospace' });

        // caret
        if (this.focused && this._caretVisible){
            // simple caret at end of text
            // approximate caret x pos by measuring characters width as 8px each (monospace assumption)
            // approximate caret x pos using monospace approx (8px per char)
            const approxX = this.pos.x + this.offset.x + 8 + Math.min(this.text.length * 8, this.size.x - 16);
            const carety1 = this.pos.y + this.offset.y + 8;
            const carety2 = this.pos.y + this.offset.y + this.size.y - 8;
            UIDraw.rect(new Vector(approxX, carety1), new Vector(2, carety2 - carety1), '#FFFFFF');
        }
    }
}
