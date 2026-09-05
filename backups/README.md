# Device backups — KM08-708H (MT7621)

Two dumps taken over the Breed bootloader console while recovering a router
that had been locked out by an early access-point-mode bug. They are kept here
so the recovery is repeatable and so the flash layout can be read without
opening a device again.

| file | contents | uncompressed |
|---|---|---|
| `km08-708h-fullflash.bin.gz` | the whole 128 MiB NAND | 134,217,728 B |
| `km08-708h-eeprom.bin.gz`    | the WiFi calibration EEPROM | 262,144 B |

Both are gzip'd only because git refuses single files over 100 MiB. `gunzip`
restores them byte for byte:

```sh
gunzip -k km08-708h-fullflash.bin.gz
sha256sum km08-708h-fullflash.bin
# 083df1faa7be613e71e6199625b5dbad9b7be41edaf03cf7be6a234ff4735259

gunzip -k km08-708h-eeprom.bin.gz
sha256sum km08-708h-eeprom.bin
# c3d63ba13367aa1b6febca09c33772da4ec87d10e0efe7de9751d5072bad5b62
```

## Flash layout, as mapped from the dump

| offset | what |
|---|---|
| `0x00000000` | bootloader (Breed 1.1, r1286) |
| `0x00100000` | factory / ART |
| UBI volume 0 | `rootfs` — squashfs |
| `0x02B20000` | UBI volume 1 — `rootfs_data`, UBIFS |

`rootfs_data` is where a running system keeps `/etc/config`, and this dump was
taken *before* the device was recovered — while it was still carrying the
configuration that had locked it out. The overlay is not empty: 3282 UBIFS
nodes sit in that region. So `/etc/config/wireless` and `/etc/shadow` are in
here, which means the WiFi passphrase and the root password hash are too.

They are not visible to `strings`, because UBIFS compresses them. That is not
protection — `ubireader` on the volume recovers the files in a couple of
minutes. Treat every secret this router held at the time as published.

## Reading it without flashing anything

`scripts/bootloader_probe.py` listens for what a bootloader announces (TFTP
filename, recovery web page, or an open port) without serving or writing a
thing. `scripts/rescue_dhcp.py` hands a single lease to a router whose LAN was
left on `proto dhcp`, which brings the web interface back without flashing.

> These images belong to one specific unit. Writing them to a different board
> — even the same model — installs that unit's MAC addresses and calibration.
> They are a reference, not a firmware release.
