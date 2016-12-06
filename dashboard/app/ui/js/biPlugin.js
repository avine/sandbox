
///////////////////////////
// jQuery plugin generator

(function ($) {

	var propList = function (object) {
		var list = [];
		for (var prop in object) list.push(prop);
		return list;
	},

	hasChanged = function (source, target) {
		for (var prop in source) if (target[prop] != source[prop]) return true;
		return false;
	},

	isEmpty = function (array) {
		for (var i = 0; i < array.length; i++) if (undefined !== array[i]) return false;
		return true;
	},

	plugin = function (name, settings, prototype, methods) {

		settings = settings || {};

		var Plugin = function (element) {
			this.$element = $(element);
			this.pluginName = name; // helper for debugging
			this.pluginMethods = propList(methods); // helper for debugging
		};

		var dataName = 'jquery-bi-plugin-instance-' + name;

		$.extend(Plugin.prototype = {
		    _wakeup: function (options) {
		        var isOptions = $.isPlainObject(options);
		        this.optionsHasChanged = !!(isOptions && this.options && hasChanged(options, this.options));
		        if (!this.options || isOptions) this.options = $.extend({}, settings, this.options || {}, isOptions ? options : {});
				if (this.isInit && 'init' in this) this.init.apply(this, arguments);
				if ('wakeup' in this) this.wakeup.apply(this, arguments);
			},
			callMethod: function (action) {
				if (action in methods) return methods[action].apply(this, Array.prototype.slice.call(arguments, 1));
			},
			destroy: function () {
				this.$element.data(dataName, null);
			}
		}, prototype || {});

		methods = methods || {};
		if (!methods.debug) methods.debug = function () { console.log(this); return this; }; // helper for debugging

		var fn = function (action) {
			var result = [], args = arguments;
			$.each(this, function () {
				var $this = $(this), p = $this.data(dataName), isInit = !p, r; // p=plugin, r=result
				if (isInit) $this.data(dataName, p = new Plugin(this)); // Store the new instance
				p.isInit = isInit;
				if (!(action in methods)) {
					p._wakeup.apply(p, args || []);
					if (p.options.defaultMethod && !p.optionsHasChanged) r = methods[p.options.defaultMethod].apply(p);
				} else {
					p._wakeup();
					r = methods[action].apply(p, Array.prototype.slice.call(args, 1));
				}
				result.push(r);
			});
			if (isEmpty(result)) return this;
			return (1 == result.length) ? result[0] : result;
		};

		// Expose configuration
		fn.settings = settings;
		fn.methods = methods;

		// Extend jQuery
		$.fn[name] = fn;
	};

	$.biPlugin = plugin;

})(jQuery);

/*
///////////////////////
// jQuery biXXX plugin

(function ($) {

	var name = 'biXXX', // Plugin name

	settings = {

	},

	prototype = {
		init: function () {

		},
		wakeup: function () {

		}
	},

	methods = {

	};

	// Generate the new jQuery method $.fn[name]
	$.biPlugin(name, settings, prototype, methods);

})(jQuery);
*/

//////////////////////////////////
// Mobile device detection
// desktop/mobile events switcher

(function ($, isMobile) {

	if (undefined === isMobile) {
		isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	}
	var desktop = ['mousedown', 'mouseup', 'mousemove', 'mouseleave'],
		mobile = ['touchstart', 'touchend', 'touchmove', 'touchleave'];

	var from, to;
	if (isMobile) { from = desktop; to = mobile; } else { from = mobile; to = desktop; }

	for (var map = {}, i = 0; i < from.length; i++) map[from[i]] = to[i];

	var namespace = 'biEvent';

	var events = function(e) {
		e = [].concat(e).join(' ').match(/\S+/g) || [''];
		for (var i = 0; i < e.length; i++) {
			var s = e[i].split('.'), event = s.shift(), ns = s;
			if (event in map) event = map[event];
			if (!~ns.indexOf(namespace)) ns.push(namespace);
			e[i] = event + '.' + ns.join('.');
		}
		return e.join(' ');
	};

	// Expose
	$.biPlugin.isMobile = !!isMobile;
	$.biPlugin.namespace = namespace;
	$.biPlugin.events = events;

})(jQuery);

///////////////////////
// biPlugin tool.color DEPRECATED (unused)

(function ($) {

    var color = {

        rgb2Hexa: function (rgb, getNumber) {
            var hexa = '', m = (rgb + '').replace(/\s/g, '').match(/rgb\(([0-9]{1,3}),([0-9]{1,3}),([0-9]{1,3})\)/i),
                unit = "0123456789ABCDEF";
            if (!m) return rgb;
            for (var i = 1; i <= 3; i++) hexa += unit.charAt((m[i] - m[i] % 16) / 16) + unit.charAt(m[i] % 16);
            if (getNumber) return hexa;
            return '#' + hexa;
        },

        hexa2Rgb: function (hexa, getArray) {
            var rgb = [], m = (hexa + '').match(/[0-9a-f]/gi) || [], s, h, i;
            switch (m.length) {
                case 3: s = 0; break; // "s" represents a shift
                case 6: s = 1; break;
                default: return hexa;
            }
            for (i = 0; i < 3; i++) {
                h = m[(s + 1) * i] + m[(s + 1) * i + s]; // "h" represents an hexa part
                rgb.push(parseInt(h || 0, 16));
            }
            if (getArray) return rgb;
            return 'rgb(' + rgb.join(', ') + ')';
        },

        range: function (from, to, steps) {
            from = color.hexa2Rgb(from, true);
            to = color.hexa2Rgb(to, true);
            for (var list = [], i = 0; i < steps; i++) list.push([]);
            for (var j = 0; j < 3; j++) for (var clr, i = 0; i < steps; i++) {
                clr = i < steps - 1 ? from[j] + (to[j] - from[j]) / steps * i : to[j];
                list[i].push(parseInt(clr, 10));
            }
            for (var i = 0; i < list.length; i++) list[i] = color.rgb2Hexa('rgb(' + list[i].join(',') + ')');
            return list;
        },

        ranges: function (colors, steps) {
            while (colors.length > steps && colors.length > 2) {
                if (colors.length % 2) {
                    colors[colors.length - 2] = colors[colors.length - 1];
                    colors.pop();
                } else {
                    colors[1] = colors[0];
                    colors.shift();
                }
            }
            var l = colors.length,
                s = parseInt((steps + l - 2) / (l - 1), 10), // Sub-steps
                m = (steps + l - 2) % (l - 1); // Steps modulo
            for (var list = [], i = 1; i < l; i++) {
                if (1 < i) list.pop();
                list = list.concat(color.range(colors[i - 1], colors[i], s + (l - 1 == i ? m : 0)));
            }
            return list;
        }

    };

    // Expose
    $.biPlugin.tool = $.biPlugin.tool || {};
    $.biPlugin.tool.color = color;

})(jQuery);

// IE <= 10 detection DEPRECATED (unused)
(function ($) {

    var ieVersion = -1; // indicating the use of another browser
    if (navigator.appName == 'Microsoft Internet Explorer') {
        var ua = navigator.userAgent,
            re = new RegExp("MSIE ([0-9]{1,}[\.0-9]{0,})");
        if (re.exec(ua) != null) ieVersion = parseFloat(RegExp.$1);
    }

    // Expose
    $.biPlugin.tool = $.biPlugin.tool || {};
	$.biPlugin.tool.browser = {
		isIe: function () { return -1 !== ieVersion; },
		getIeVersion: function () { return ieVersion; }
	};

})(jQuery);
