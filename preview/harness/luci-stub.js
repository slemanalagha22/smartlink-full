/*
 * A minimum LuCI runtime, enough to execute the real data.js and bindings.js
 * outside a router.
 *
 * LuCI modules are plain scripts whose 'require x' lines are directives to its
 * loader and whose top-level `return` yields the module. Wrapping the source in
 * a Function with the dependencies as parameters reproduces that contract, so
 * the files under test run unmodified - selectors and all.
 */

(function (global) {
	'use strict';

	/* ---- LuCI adds this to String.prototype ---------------------------- */
	if (!String.prototype.format) {
		String.prototype.format = function () {
			var args = arguments, i = 0;

			return this.replace(/%[sdif%](?:\.\d+)?/g, function (m) {
				if (m === '%%') return '%';
				var v = args[i++];
				if (m.indexOf('d') >= 0 || m.indexOf('i') >= 0) return String(parseInt(v, 10));
				if (m.indexOf('f') >= 0) return String(parseFloat(v));
				return String(v);
			});
		};
	}

	global._ = function (s) { return s; };

	/* ---- element builder ------------------------------------------------ */
	global.E = function (tag, attrs, children) {
		if (Array.isArray(tag)) {
			var frag = document.createDocumentFragment();
			tag.forEach(function (c) { frag.appendChild(c); });
			return frag;
		}

		var el = document.createElement(tag);

		if (attrs && typeof attrs === 'object' && !Array.isArray(attrs) && !(attrs instanceof Node)) {
			Object.keys(attrs).forEach(function (k) {
				var v = attrs[k];
				if (v === null || v === undefined) return;
				if (typeof v === 'function') el.addEventListener(k, v);
				else el.setAttribute(k, v);
			});
		}
		else {
			children = attrs;
		}

		[].concat(children === undefined ? [] : children).forEach(function (c) {
			if (c === null || c === undefined) return;
			el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
		});

		return el;
	};

	/* ---- fixtures ------------------------------------------------------- */
	var FIXTURES = {
		'system.board': {
			hostname: 'SMARTLink-8096',
			model: 'SMARTLink H724G',
			kernel: '5.15.150',
			release: { distribution: 'OpenWrt', version: '24.10.0', revision: 'r28427' }
		},
		'system.info': { uptime: 9312, load: [ 1024, 900, 800 ], memory: { total: 134217728, free: 78643200 } },
		'luci-rpc.getDHCPLeases': {
			dhcp_leases: [
				{ macaddr: 'f0:18:98:c3:44:a2', ipaddr: '192.168.1.102', hostname: 'MacBook-Pro', expires: 43200 },
				{ macaddr: '88:32:9b:d1:f2:09', ipaddr: '192.168.1.105', hostname: 'Galaxy-S21', expires: 43200 },
				{ macaddr: '00:1a:2b:3c:4d:5e', ipaddr: '192.168.1.101', hostname: 'Office-PC', expires: 43200 },
				{ macaddr: 'aa:bb:cc:dd:ee:01', ipaddr: '192.168.1.140', hostname: 'Printer', expires: 43200 }
			]
		},
		'luci-rpc.getHostHints': {
			'F0:18:98:C3:44:A2': { name: 'MacBook Pro (Ali)', ipaddrs: [ '192.168.1.102' ] },
			'00:1A:2B:3C:4D:5E': { name: 'Home PC — Office', ipaddrs: [ '192.168.1.101' ] }
		},
		'luci-rpc.getNetworkDevices': {
			'eth1': { stats: { rx_bytes: 0, tx_bytes: 0 } }
		}
	};

	/* counters climb on every poll so throughput is non-zero */
	var tick = 0;

	function canned(object, method) {
		var key = object + '.' + method;

		if (key === 'luci-rpc.getNetworkDevices') {
			tick++;
			return {
				'eth1': {
					stats: {
						rx_bytes: 4000000 + tick * 900000 + Math.round(Math.random() * 400000),
						tx_bytes: 1000000 + tick * 200000
					}
				}
			};
		}

		return FIXTURES[key] !== undefined ? FIXTURES[key] : {};
	}

	function wifiNetwork(band, ssid, ifname, stations) {
		return {
			getIfname: function () { return ifname; },
			getSSID: function () { return ssid; },
			isUp: function () { return true; },
			isDisabled: function () { return false; },
			getChannel: function () { return band === '5' ? 36 : 6; },
			getFrequency: function () { return band === '5' ? '5.180' : '2.437'; },
			getActiveEncryption: function () { return 'WPA2 PSK'; },
			getAssocList: function () { return Promise.resolve(stations); }
		};
	}

	var STUBS = {
		baseclass: { extend: function (proto) { return proto; } },

		rpc: {
			declare: function (opts) {
				return function () {
					var data = canned(opts.object, opts.method);

					if (opts.expect && Object.prototype.hasOwnProperty.call(opts.expect, ''))
						return Promise.resolve(data);

					return Promise.resolve(data);
				};
			}
		},

		uci: {
			load: function () { return Promise.resolve(); },
			get: function () { return null; },
			sections: function () { return []; }
		},

		network: {
			getWANNetworks: function () {
				return Promise.resolve([ {
					isUp: function () { return true; },
					getProtocol: function () { return 'dhcp'; },
					getI18n: function () { return 'DHCP client'; },
					getIPAddr: function () { return '100.64.10.5'; },
					getGatewayAddr: function () { return '100.64.10.1'; },
					getDNSAddrs: function () { return [ '1.1.1.1' ]; },
					getUptime: function () { return 9200; },
					getL3Device: function () { return { getName: function () { return 'eth1'; } }; }
				} ]);
			},

			getNetwork: function (name) {
				if (name !== 'lan') return Promise.resolve(null);
				return Promise.resolve({
					isUp: function () { return true; },
					getIPAddr: function () { return '192.168.1.1'; },
					getNetmask: function () { return '255.255.255.0'; }
				});
			},

			getWifiNetworks: function () {
				return Promise.resolve([
					wifiNetwork('5', 'SMARTLink_Home_5G', 'wlan0', [
						{ mac: 'F0:18:98:C3:44:A2', signal: -52, rx: { rate: 780000 }, tx: { rate: 650000 } }
					]),
					wifiNetwork('2.4', 'SMARTLink_Home', 'wlan1', [
						{ mac: '88:32:9B:D1:F2:09', signal: -67, rx: { rate: 144000 }, tx: { rate: 120000 } }
					])
				]);
			}
		},

		fs: {
			read: function (path) {
				if (path.indexOf('thermal_zone') >= 0)
					return Promise.resolve('42150\n');

				return Promise.reject(new Error('not found'));
			}
		},

		poll: {
			add: function (fn, interval) {
				global.__slPolls.push({ fn: fn, interval: interval });
				return true;
			}
		},

		ui: {
			showModal: function (title) { global.__slModals.push(title); return document.createElement('div'); },
			hideModal: function () {},
			addNotification: function (t, c, kind) { global.__slNotifications.push(kind || 'info'); }
		}
	};

	global.__slPolls = [];
	global.__slModals = [];
	global.__slNotifications = [];

	global.L = {
		resolveDefault: function (promise, fallback) {
			return Promise.resolve(promise).catch(function () { return fallback; });
		},
		resource: function (p) { return '/luci-static/resources/' + (p || ''); },
		url: function () { return '#'; },
		env: { dispatchpath: [], requestpath: [] },
		Poll: STUBS.poll
	};

	/* ---- module loader --------------------------------------------------- */
	var loaded = {};

	global.slLoadModule = function (name, url, extraDeps) {
		return fetch(url).then(function (r) {
			if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
			return r.text();
		}).then(function (src) {
			var deps = Object.assign({}, STUBS, extraDeps || {}),
			    names = Object.keys(deps),
			    values = names.map(function (n) { return deps[n]; });

			var factory = new Function(names.join(','), src);

			loaded[name] = factory.apply(null, values);
			return loaded[name];
		});
	};
})(window);
