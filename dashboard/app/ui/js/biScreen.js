
//////////////////////////
// jQuery biScreen plugin (screen breakpoint detection)

(function ($) {

	var name = 'biScreen', // Plugin name

	settings = {
		callback: undefined // function (e, status) { console.log('screen status is:' + status); }
	},

	prototype = {
		init: function () {
			var $status = this.$status = $('<div class="bi-screen">').appendTo(this.$element);
			$status.on('transitionend', function (e) {
				var status = this.callMethod('status');
				this.updateCss(status);
				if (this.options.callback) this.options.callback.call(this.$element[0], e, status);
				this.$element.trigger($.biPlugin.events('screen'), status);
			}.bind(this));
			this.updateCss();
		},
		wakeup: function () {

		},
		updateCss: function (status) {
			status = status || this.callMethod('status');
			var reverse = { large: 'small', small: 'large' };
			this.$element.removeClass('bi-screen-' + reverse[status]).addClass('bi-screen-' + status);
		}
	},

	methods = {
		status: function () {
			return '-9999px' === this.$status.css('left') ? 'small' : 'large';
		}
	};

	// Generate the new jQuery method $.fn[name]
	$.biPlugin(name, settings, prototype, methods);

})(jQuery);
