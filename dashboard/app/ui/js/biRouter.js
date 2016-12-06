
//////////////////////////
// jQuery biRouter plugin

(function ($) {

	var name = 'biRouter', // Plugin name

	settings = {
        skipAnimation: false, // skip css animation (and keep only css transition)
		slide: false,
		background: false,
		static: false, // if 'static'=true then 'slide'=true will have no effect
		nodeName: '' // default: 'div' (use 'span' and 'static'=true to get inline behaviour)
	},

	prototype = {
		init: function () {
			this.nodeName = this.options.nodeName; // Specific nodeName
			if (!this.nodeName) {
				this.nodeName = 'span' === this.$element[0].nodeName.toLowerCase() ? 'span' : 'div'; // Only 'div' (default) or 'span' allowed
			}
			this.$containers = {};
			this.$element.addClass('bi-router').children().each(function (index, container) {
				var $container = $(container).addClass('bi-router-container');
				if (0 == index) $container.addClass('bi-router-active');
				this.$containers[$container.data('router-path')] = $container;
			}.bind(this));
		},
		wakeup: function () {
		    ['skipAnimation', 'slide', 'background', 'static'].forEach(function (css) {
//				if ('slide' === css && this.options.static) return; // if 'static'=true then 'slide'=true will have no effect (so it's useless to add it...)
				this.$element[this.options[css] ? 'addClass' : 'removeClass']('bi-router-' + css);
			}.bind(this));
		}
	},

	methods = {
		add: function (path, html, makeActive) {
			if (!this.$containers[path]) {
				this.$containers[path] =
					$('<' + this.nodeName + ' data-router-path="' + path + '">')
						.addClass('bi-router-container').appendTo(this.$element);
			}
			this.$containers[path].html(html);
			if (undefined === makeActive || !!makeActive) this.callMethod('goTo', path);
			return this.$containers[path].get(0);
		},
		remove: function (path) {
			if (!this.$containers[path]) return null;
			if (this.path == path) this.path = undefined; // Unset this.path
			var $container = this.$containers[path].remove();
			delete this.$containers[path];
			return $container.get(0);
		},
		goTo: function (path) {
		    if (!this.$containers[path]) return null;
		    path += ''; // toString
            if (this.path != path) {
                for (var p in this.$containers) {
                    this.$containers[p][p === path ? 'addClass': 'removeClass']('bi-router-active');
                }
                var _path = this.path;
                this.path = path;
                this.$element.trigger($.biPlugin.events('router'), {
                    previous: _path, current: this.path
                });
            }			
            return this.callMethod('getContainer');
		},
		getPath: function () {
			return this.path;
		},
		isPath: function (path) {
			return !!this.$containers[path];
		},
		getContainer: function (path) {
		    path = undefined !== path ? path : this.callMethod('getPath');
		    return path in this.$containers ? this.$containers[path].get(0) : null;
		}
	};

	// Generate the new jQuery method $.fn[name]
	$.biPlugin(name, settings, prototype, methods);

})(jQuery);
