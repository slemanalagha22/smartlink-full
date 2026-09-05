# SMARTLink — source

The full working tree behind [SMARTLink](https://github.com/slemanalagha22/smartlink-luci):
an Arabic-first, RTL-aware interface for OpenWrt routers, shipped as two
ordinary `.ipk` packages — a LuCI theme and the pages that go with it.

This repository is the development side. If you only want to *install*
SMARTLink on a router, use the one-command installer in
[`smartlink-luci`](https://github.com/slemanalagha22/smartlink-luci); the built
packages are mirrored under [`packages/`](packages/) here as well.

```
luci-theme-smartlink/    the theme: ucode templates, CSS, fonts, login art
luci-app-smartlink/      the pages: views, data layer, mode planner, widgets
packages/                built .ipk files, currently 1.3.1-1
scripts/                 build, deploy, artwork, and recovery tooling
preview/                 a browser harness for working on the UI without a router
backups/                 flash dumps from the device this was developed against
```

## Building

No OpenWrt buildroot and no toolchain. `scripts/build_ipk.py` writes both
packages in pure Python:

```sh
python scripts/build_ipk.py
```

The output lands in `dist/`. Copy it over `packages/` when cutting a release,
and bump the version in both control files and in `install.sh` — opkg treats an
unchanged version as "already up to date" and quietly skips the install.

## Deploying to a router

`scripts/deploy_ubus.py` installs over an ordinary LuCI session, so it needs
nothing on the router but the web interface — no ssh, no dropbear:

```sh
python scripts/deploy_ubus.py --host 192.168.1.1 --password <admin password>
```

It uploads in 24 KiB chunks and then verifies the install by checking the size
of the largest file each package claims to have written. `scripts/deploy.sh` is
the ssh equivalent for when ssh is available.

## How it is put together

**The theme is a LuCI *mode*, not a replacement for `admin`.** `menu.d` declares
a top-level `smartlink` key beside `admin`, which gives SMARTLink its own
`#topmenu` and puts LuCI's own pages one click away under `#modemenu`. Earlier
attempts that reused `admin` merged the two navigations into each other.

**Templates are ucode (`.ut`), not Lua** — LuCI 23.05 and 24.10 render
`header.ut` / `footer.ut` / `sysauth.ut` from `ucode/template/themes/smartlink/`.

**Data comes from batched ubus over `/cgi-bin/luci/admin/ubus`.** `data.js`
posts a JSON-RPC array and gets the whole dashboard — board, system info,
interface dump, wireless, DHCP leases, host hints, devices, and the builtin
ethernet ports — in one round trip. LuCI's `rpc.declare()` never settled on this
firmware; the direct call answers in about 300 ms.

**Configuration changes are protected by netifd's rollback timer.** `modes.js`
plans a change, `applyWithRollback()` commits it with `{rollback: true}`, and
the browser has to come back and `uci confirm` before the timeout or the router
reverts on its own. A mode switch that cuts your own connection undoes itself.

**Ports live on the bridge device, not the interface.** On DSA firmware the LAN
ports are listed in a `config device` section named `br-lan`, and writing them
onto `network.lan` instead is what locked a device out during development —
see [`backups/README.md`](backups/README.md).

## Working on the UI without a router

`preview/` renders the pages against recorded fixtures:

```sh
python -m http.server 8899 --directory preview
```

`preview/site/` holds the standalone page set; `preview/harness/` wires the real
view modules against canned ubus responses.

## Artwork

`scripts/make_login_bg.py` generates both login backgrounds from geometry —
horizon, lattice masts, signal arcs, mesh — rather than storing hand-drawn SVG.
It emits a light and a dark variant, and asserts that every group declares a
`fill`, because an open subpath with no `fill` renders solid black.

## Status

Working on hardware: dashboard, devices, wireless, LAN, internet, network,
applications, tools, the four-step setup wizard, and WISP mode with client NAT.

Not yet proven on hardware: access-point mode — the bridge-section fix is
verified by dry run against a live config, and the rollback timer now protects
the attempt. Repeater mode needs `relayd`, which was not installed on the test
device. Per-client rate limiting is unimplemented; blocking works via firewall
rules.
