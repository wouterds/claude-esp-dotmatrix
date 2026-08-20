# Hardware

A Waveshare ESP32-S3-Matrix: an **ESP32-S3FH4R2** with an 8x8 WS2812 matrix on
**GPIO14**, talking over the S3's own USB-Serial-JTAG peripheral. It enumerates
as Espressif `303a:1001`, which is what the host matches on - the tty node is
named after whichever port it landed on and changes when the board moves.

## Building and flashing

PlatformIO, installed however you like as long as **pip is in the same
environment**. Installed with `uv tool install platformio` alone, PlatformIO
cannot install esptool's python dependencies and the build dies on
`MissingPackageManifestError` a long way from the cause:

```bash
uv tool install --with pip platformio

npm run firmware:build
npm run firmware:flash
npm run firmware:monitor
```

## The two things that cost a day

**The flash header must say 4MB.** There is no PlatformIO board definition for
this module, so it is the generic S3 devkit narrowed down - and that profile
assumes 8MB. `board_build.flash_size` only reaches the app; without the
`board_upload` entries the second stage bootloader keeps an 8MB header, the flash
probe fails against the real chip, and **the sketch never runs**. The board
enumerates on USB, exposes no CDC interface and looks bricked. The one line that
says so scrolls past before a monitor can attach:

```
E (89) spi_flash: Detected size(4096k) smaller than the size in the binary image header(8192k)
```

**`ARDUINO_USB_CDC_ON_BOOT=1` is what points `Serial` at USB.** Left at the
devkit default of 0, `Serial` goes to the UART pins and the board looks mute over
USB while running perfectly well.

## When the port disappears

Flashing ends with `Hard resetting via RTS pin`, and that reset sometimes leaves
macOS with the USB device enumerated but **no CDC interface and no tty** - so
esptool has nothing to reflash through and it reads as a dead board. It is not.

`ioreg -w0 -r -n "USB JTAG/serial debug unit" -l` shows the device present with
no `IOUSBHostInterface` under it, which is the tell.

A power cycle fixes it. If the board is on a hub with per-port power switching -
`ppps` in `uhubctl`'s listing - that needs no hands:

```bash
uhubctl                              # find the hub and port, check for ppps
uhubctl -l <hub> -p <port> -a cycle -d 3
```

Otherwise, unplug it.

## Power

A WS2812 channel draws about 20mA wide open, so a full white panel wants **3.8A**
against a USB port's 500mA. The host is free to send white, so the firmware sums
every frame, converts at 20mA a channel and scales the whole frame down if it
would exceed 450mA.

This is enforced rather than trusted because a brownout presents as a reboot or a
hang with nothing pointing at the frame that caused it. The visible symptom of
the cap doing its job is a picture dimmer than the brightness asked for.
