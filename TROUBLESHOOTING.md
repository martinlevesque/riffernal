# Troubleshooting

## MIDI keyboard not detected

### Symptoms

- The game shows "No MIDI device found" or only shows a virtual port like "Midi Through Port-0"
- Playing keys on the MIDI keyboard has no effect

### Causes

#### PipeWire + Flatpak (Linux)

On Linux systems using PipeWire (Ubuntu 22.04+, Fedora, Pop!_OS, etc.), the Web MIDI API in browsers installed as Flatpak may only see virtual ALSA ports (e.g., "Midi Through Port-0") and not real USB MIDI devices. This is because PipeWire's ALSA MIDI bridge does not always expose hardware MIDI devices to sandboxed applications.

#### Check what ALSA sees

Run this in a terminal to list all MIDI devices at the ALSA level:

```bash
amidi -l
```

You should see your device listed, e.g.:

```
IO  hw:4,0,0  DeepMind12 MIDI 1
```

If it's listed here but not in the browser, PipeWire is likely the issue.

#### Check ALSA sequencer clients

```bash
aconnect -l
```

This shows all ALSA sequencer clients. Your device should appear as a client, e.g.:

```
client 32: 'DeepMind12' [type=noyau,card=4]
    0 'DeepMind12 MIDI 1'
```

### Fix: Route your device through Midi Through

Connect your device's output to the virtual "Midi Through Port-0" that the browser can see:

```bash
aconnect <device-client>:0 <midi-through-client>:0
```

For example, if your device is client 32 and Midi Through is client 14:

```bash
aconnect 32:0 14:0
```

Verify the connection:

```bash
aconnect -l
```

You should see the connection listed under the Midi Through client:

```
client 14: 'Midi Through' [type=noyau]
    0 'Midi Through Port-0'
        Connecté Depuis: 32:0
```

#### Make it permanent across reboots

**Bash:**

```bash
echo 'aconnect 32:0 14:0' >> ~/.bashrc
```

**Fish:**

```bash
echo 'aconnect 32:0 14:0' >> ~/.config/fish/config.fish
```

**Systemd user service (survives even if no shell is opened):**

Create `~/.config/systemd/user/midi-connect.service`:

```ini
[Unit]
Description=Connect MIDI keyboard to Midi Through
After=pipewire.service

[Service]
Type=oneshot
ExecStart=/usr/bin/aconnect 32:0 14:0

[Install]
WantedBy=default.target
```

Then enable it:

```bash
systemctl --user daemon-reload
systemctl --user enable midi-connect.service
```

#### Find your device client number

If you're not sure which client number is your keyboard, run `aconnect -l` and look for your device name (not "Midi Through"). The client number is on the left, e.g., `client 32: 'DeepMind12'`.

### Finding device numbers automatically

Run `aconnect -l` and identify:
1. Your keyboard's client number (e.g., 32)
2. The "Midi Through Port-0" client number (usually 14, but can vary)

Then use those numbers in the `aconnect` command.

## Web MIDI not supported

If the page shows "Web MIDI not supported":

- Make sure you're using Chrome, Edge, or Opera (Firefox does not support Web MIDI)
- The page must be served over HTTPS or localhost for Web MIDI to work
- Check that the browser has MIDI permissions (some enterprise policies disable it)

## No sound

- Click on the page first to enable audio (browsers block autoplay)
- Check that your system volume is not muted
- The synthesizer uses Web Audio API — no plugins needed

## Keyboard input not working (computer keyboard)

The computer keyboard maps physical keys to piano notes:

- Bottom row (Z-M, punctuation): C2-B2
- Middle row (A-L, W/P): C3-D#4
- Top row (1-0, -, =): C5-B5

Make sure the game window is focused and not in the menu.
