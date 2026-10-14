import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DOWN_KEY = 'screen-brightness-down';
const UP_KEY = 'screen-brightness-up';

const BACKLIGHT_DIR = '/sys/class/backlight';
const PREFERRED_DEVICES = [
    'intel_backlight',
    'amdgpu_bl1',
    'amdgpu_bl0',
    'acpi_video0',
];

const STEPS = 20;
const MIN_BRIGHTNESS = 1;

const LOGIN1_NAME = 'org.freedesktop.login1';
const LOGIN1_SESSION_PATH = '/org/freedesktop/login1/session/auto';
const LOGIN1_SESSION_IFACE = 'org.freedesktop.login1.Session';

function clamp(value, lower, upper) {
    return Math.min(Math.max(value, lower), upper);
}

export default class ZeroBrightnessExtension extends Extension {
    enable() {
        this._device = null;
        this._max = 0;
        this._step = 1;
        this._downHandlerInstalled = false;
        this._upHandlerInstalled = false;

        this._device = this._findBacklightDevice();
        if (!this._device) {
            log('zero-brightness: no usable backlight device found');
            return;
        }

        this._max = this._readBrightness('max_brightness');
        if (this._max <= 0) {
            log('zero-brightness: max_brightness is 0');
            this._device = null;
            return;
        }

        this._step = Math.max(1, Math.floor(this._max / STEPS));
        this._downHandlerInstalled =
            this._installHandler(DOWN_KEY, () => this._stepBrightness(-1));
        this._upHandlerInstalled =
            this._installHandler(UP_KEY, () => this._stepBrightness(1));
    }

    disable() {
        if (this._downHandlerInstalled)
            this._restoreDefaultHandler(DOWN_KEY, scale => scale?.stepDown());
        if (this._upHandlerInstalled)
            this._restoreDefaultHandler(UP_KEY, scale => scale?.stepUp());

        this._downHandlerInstalled = false;
        this._upHandlerInstalled = false;
        this._device = null;
    }

    _installHandler(name, handler) {
        if (!Meta.keybindings_set_custom_handler(name, handler)) {
            log(`zero-brightness: could not override ${name}`);
            return false;
        }

        Main.wm.allowKeybinding(name, Shell.ActionMode.ALL);
        return true;
    }

    _restoreDefaultHandler(name, stepGlobalScale) {
        Meta.keybindings_set_custom_handler(name,
            () => stepGlobalScale(Main.brightnessManager?.globalScale));
    }

    _stepBrightness(delta) {
        if (!this._device || this._max <= 0)
            return;

        const currentBrightness = this._readBrightness('brightness');
        const next = this._nextBrightness(currentBrightness, delta);

        this._setBrightness(next);
        this._showOsd(next / this._max);
    }

    _nextBrightness(current, delta) {
        const stepped = current + delta * this._step;

        if (delta < 0 && stepped <= 0)
            return current > MIN_BRIGHTNESS ? MIN_BRIGHTNESS : 0;

        return clamp(stepped, 0, this._max);
    }

    _showOsd(level) {
        try {
            Main.osdWindowManager.showOne(
                Main.layoutManager.primaryIndex,
                Gio.Icon.new_for_string('display-brightness-symbolic'),
                null,
                clamp(level, 0, 1)
            );
        } catch (e) {
            logError(e, 'zero-brightness: failed to show OSD');
        }
    }

    _setBrightness(value) {
        Gio.DBus.system.call(
            LOGIN1_NAME,
            LOGIN1_SESSION_PATH,
            LOGIN1_SESSION_IFACE,
            'SetBrightness',
            new GLib.Variant('(ssu)', ['backlight', this._device, value]),
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (bus, result) => {
                try {
                    bus.call_finish(result);
                } catch (e) {
                    logError(e, 'zero-brightness: SetBrightness failed');
                }
            }
        );
    }

    _findBacklightDevice() {
        try {
            const dir = GLib.Dir.open(BACKLIGHT_DIR, 0);
            const names = [];
            let name;
            while ((name = dir.read_name()) !== null)
                names.push(name);
            dir.close();

            for (const preferred of PREFERRED_DEVICES) {
                if (names.includes(preferred))
                    return preferred;
            }

            return names.length > 0 ? names[0] : null;
        } catch (e) {
            logError(e, 'zero-brightness: cannot list backlight devices');
            return null;
        }
    }

    _readBrightness(attribute) {
        const path = `${BACKLIGHT_DIR}/${this._device}/${attribute}`;
        try {
            const [ok, contents] = GLib.file_get_contents(path);
            if (!ok)
                return 0;

            const decoded = new TextDecoder().decode(contents);
            return parseInt(decoded, 10) || 0;
        } catch (e) {
            logError(e, `zero-brightness: cannot read ${path}`);
            return 0;
        }
    }
}
