export default class Saver {
    constructor(storageKey = "gameData") {
        this.storageKey = storageKey;
        // In-memory cache for synchronous access
        this.savedata = {};
        // IndexedDB handles larger storage; init async but keep localStorage fallback
        this._db = null;
        this._dbName = 'dicey-saver-' + String(this.storageKey);
        this._dbReady = false;
        this._openIndexedDB();
        // Load synchronously from localStorage first for compatibility
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) this.savedata = JSON.parse(data);
        } catch (e) {
            this.savedata = {};
        }
        // Migrate/refresh from IndexedDB in background
        this._refreshFromIndexedDB();
    }

    async _openIndexedDB() {
        if (this._db) return this._db;
        return new Promise((res) => {
            try {
                const req = indexedDB.open(this._dbName, 1);
                req.onupgradeneeded = (ev) => {
                    const db = ev.target.result;
                    if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
                };
                req.onsuccess = (ev) => {
                    this._db = ev.target.result;
                    this._dbReady = true;
                    res(this._db);
                };
                req.onerror = () => { this._dbReady = false; res(null); };
            } catch (e) { this._dbReady = false; res(null); }
        });
    }

    async _putKV(key, value) {
        try {
            await this._openIndexedDB();
            if (!this._db) return false;
            return new Promise((res) => {
                const tx = this._db.transaction(['kv'], 'readwrite');
                const store = tx.objectStore('kv');
                const r = store.put(value, key);
                r.onsuccess = () => res(true);
                r.onerror = () => res(false);
            });
        } catch (e) { return false; }
    }

    async _getKV(key) {
        try {
            await this._openIndexedDB();
            if (!this._db) return undefined;
            return new Promise((res) => {
                const tx = this._db.transaction(['kv'], 'readonly');
                const store = tx.objectStore('kv');
                const r = store.get(key);
                r.onsuccess = () => res(r.result === undefined ? undefined : r.result);
                r.onerror = () => res(undefined);
            });
        } catch (e) { return undefined; }
    }

    // Load saved data: synchronous localStorage-backed read already done in constructor.
    // This method triggers an async refresh from IndexedDB if available.
    load() {
        // Keep for compatibility: callers may call saver.load(); ensure we refresh.
        this._refreshFromIndexedDB();
    }

    async _refreshFromIndexedDB() {
        try {
            const v = await this._getKV('savedata');
            if (v && typeof v === 'object') {
                this.savedata = v;
                try { localStorage.setItem(this.storageKey, JSON.stringify(this.savedata)); } catch (e) {}
            } else {
                // If no entry in IndexedDB but localStorage had content, migrate it
                try {
                    const ls = localStorage.getItem(this.storageKey);
                    if (ls) {
                        const parsed = JSON.parse(ls);
                        await this._putKV('savedata', parsed);
                        this.savedata = parsed;
                    }
                } catch (e) {}
            }
        } catch (e) {}
    }

    // Save current savedata to both localStorage (sync) and IndexedDB (async)
    save() {
        try {
            try { localStorage.setItem(this.storageKey, JSON.stringify(this.savedata)); } catch (e) {}
            // async write to IndexedDB
            this._putKV('savedata', this.savedata).catch(()=>{});
        } catch (e) {
            console.error("Failed to save data:", e);
        }
    }

    _getPathObj(path, createMissing = false) {
        const keys = path.split("/");
        let obj = this.savedata;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]]) {
                if (createMissing) obj[keys[i]] = {};
                else return undefined;
            }
            obj = obj[keys[i]];
        }
        return { obj, lastKey: keys[keys.length - 1] };
    }

    // Set value using path
    set(path, value, autoSave = true) {
        const { obj, lastKey } = this._getPathObj(path, true);
        obj[lastKey] = value;
        if (autoSave) this.save();
    }

    // Convenience: store image data (dataURL string) at a path. Accepts either
    // a dataURL string or a canvas element which will be converted using toDataURL.
    setImage(path, canvasOrDataUrl, autoSave = true) {
        try {
            let dataUrl = null;
            if (!canvasOrDataUrl) return false;
            if (typeof canvasOrDataUrl === 'string') {
                dataUrl = canvasOrDataUrl;
            } else if (canvasOrDataUrl instanceof HTMLCanvasElement && typeof canvasOrDataUrl.toDataURL === 'function') {
                dataUrl = canvasOrDataUrl.toDataURL('image/png');
            } else if (canvasOrDataUrl && typeof canvasOrDataUrl.toDataURL === 'function') {
                dataUrl = canvasOrDataUrl.toDataURL('image/png');
            } else {
                console.warn('Saver.setImage: unsupported input for image conversion');
                return false;
            }
            this.set(path, dataUrl, autoSave);
            return true;
        } catch (e) {
            console.error('Saver.setImage failed', e);
            return false;
        }
    }

    // Convenience: retrieve image dataURL saved at path (or null if missing)
    getImage(path, defaultValue = null) {
        try {
            const v = this.get(path, defaultValue);
            return v === undefined ? defaultValue : v;
        } catch (e) {
            return defaultValue;
        }
    }

    // Get value using path
    get(path, defaultValue = null) {
        const res = this._getPathObj(path, false);
        if (!res) return defaultValue;
        const { obj, lastKey } = res;
        return obj.hasOwnProperty(lastKey) ? obj[lastKey] : defaultValue;
    }

    // Get value or add default if it doesn't exist
    getOrAdd(path, defaultValue) {
        const res = this._getPathObj(path, true);
        const { obj, lastKey } = res;
        if (!obj.hasOwnProperty(lastKey)) {
            obj[lastKey] = defaultValue;
            this.save();
        }
        return obj[lastKey];
    }

    // Remove value using path
    remove(path, autoSave = true) {
        const res = this._getPathObj(path, false);
        if (!res) return;
        const { obj, lastKey } = res;
        delete obj[lastKey];
        if (autoSave) this.save();
    }

    // Clear all data
    clear(autoSave = true) {
        this.savedata = {};
        if (autoSave) this.save();
    }
}
