# zero-brightness

Shamelessly vibecoded GNOME Shell extension that lets the brightness keys dim the backlight **all the way to zero** (panel fully off), similar to macOS display brightness, and still shows the regular GNOME brightness OSD. Helps me at night to get better sleep. 😅

## Why this is needed

Mutter clamps the backlight to a minimum it computes as:

```c
min = MAX(1, max_brightness / 100)
```

On certain machines this value will always be greater than `0`, so the Shell's built-in "brightness down" key can never turn off the screen completely.
It would be really nice if this was configurable. :(

This extension sidesteps the clamp by writing the value through `org.freedesktop.login1` (`SetBrightness`), which accepts `0`, then draws the normal brightness OSD itself.

## How it works

- On enable it overrides the Shell's own handlers for the plain keys (`screen-brightness-down` / `-up`) with `Meta.keybindings_set_custom_handler()`. 
  This only changes the running Shell. 
  **Nothing is written to dconf**.
- On a key press it reads the current value from sysfs and steps by `max_brightness / 20`.
  Stepping down through the lowest step stops at `1` (the minimum backlight) and only the next press goes to `0`, so the dimmest non-zero level stays reachable.
  The result is clamped to `[0, max]`, written via logind, and shown with `Main.osdWindowManager.showOne()`.
- On disable it reinstalls handlers that drive the exported `Main.brightnessManager.globalScale`, which is exactly what the Shell's builtin handlers do.

No external helper script and no custom GSettings schema are required.

## Develop

```sh
make install
make enable
```

On Wayland the Shell cannot be restarted in place. 
**Log out and back in** after installing or after editing `extension.js`.

```sh
make logs
```

Starting from a normal brightness, press "brightness down" repeatedly: the value steps down to `1` (minimum backlight) and then to `0`, with the OSD reflecting each step. 
Press "up" to come back.

```sh
make uninstall
```

Disabling reinstalls the Shell's normal brightness stepping. 
Nothing is persisted, so even if the Shell crashes while the extension is enabled, a normal login restores the standard behaviour on the next shell start.

## Notes / caveats

- Only the plain brightness keys are handled. 
  `Shift`+brightness (the Shell's "current monitor only" actions) are left untouched.
- The OSD is shown on the primary monitor.
- This extension intentionally does not use Mutter's backlight API for writes (it clamps to the minimum). 
  Reads of the current value go straight to sysfs.
- The restore path cannot pass `null` to `Meta.keybindings_set_custom_handler()`: gjs marshals a null callback into an invalid function pointer and mutter crashes on the next key press. 
  It therefore reinstalls handlers built on the exported `Main.brightnessManager.globalScale`, which is Shell-internal but stable in GNOME 51.
