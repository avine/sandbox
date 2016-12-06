
///////////////////////////
// jQuery biNavMenu plugin

(function ($) {

	var name = 'biNavMenu', // Plugin name

	settings = {

	},

	prototype = {
		init: function () {
			this.$trigger = this.$element.find('.bi-nav-menu-trigger');

			var _this = this;
			this.$trigger.on($.biPlugin.events('mousedown'), function () { _this.callMethod('toggle'); });
		},
		wakeup: function () {

		}
	},

	methods = {
		open: function () {
			this.$element.addClass('bi-nav-menu-active').trigger($.biPlugin.events('navMenu'), { open: true });
		},
		close: function () {
			this.$element.removeClass('bi-nav-menu-active').trigger($.biPlugin.events('navMenu'), { open: false });
		},
		toggle: function () {
			this.callMethod(this.callMethod('isOpened') ? 'close' : 'open');
		},
		isOpened: function () {
			return !!this.$element.hasClass('bi-nav-menu-active');
		}
	};

	// Generate the new jQuery method $.fn[name]
	$.biPlugin(name, settings, prototype, methods);

})(jQuery);
