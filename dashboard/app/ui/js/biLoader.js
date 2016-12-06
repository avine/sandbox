
//////////////////////////
// jQuery biLoader plugin

(function ($) {

	var name = 'biLoader', // Plugin name

	settings = {
		className: '', // Customize using css class
		css: {}, // Customize using inline styles
		progress: '<i class="fa fa-3x fa-spinner fa-pulse"></i>',
		error: '<i class="fa fa-3x fa-warning"></i>',
		defaultMethod: 'progress'
	},

	prototype = {
		init: function () {
			if ("static" === this.$element.css("position")) this.$element.css("position", "relative");
			this.$loader = $("<div>").addClass('bi-loader bi-loader-hidden').appendTo(this.$element);
			this.$content = $("<div>").addClass('bi-loader-hidden').appendTo(this.$loader);
			this.$content.addClass('bi-loader-init');
		},
		wakeup: function () {
			// Check that the loader is still present in this.$element
			if (!this.$element.children('.bi-loader').size()) {
				this.isInit = true;
				this.init();
			}
			if (this.isInit || this.optionsHasChanged) {
				if (this.options.className) this.$loader.addClass(this.options.className);
				for (var rule in this.options.css) this.$loader.css(rule, this.options.css[rule]);
				if ('progress' === this.status) this.$content.html(this.options.progress);
				if ('error' === this.status) this.$content.html(this.options.error);
			}
			if (!this.isInit) this.$content.removeClass('bi-loader-init');
		},
		change: function (node, add, remove) {
			var $node = this['$' + node];
			if (add) $node.addClass(add);
			if (remove) $node.removeClass(remove);
			return this;
		}
	},

	methods = {
		progress: function () {
			if ('progress' !== this.status) {
				this.$content.html(this.options.progress);
				this.status = 'progress';
			}
			this.change('content', 'bi-loader-progress', 'bi-loader-hidden')
				.change('loader', false, 'bi-loader-hidden');
			this.$element.trigger($.biPlugin.events('loader'), 'progress');
		},
		error: function () {
			if ('error' !== this.status) {
				this.$content.html(this.options.error);
				this.status = 'error';
			}
			this.change('content', false, 'bi-loader-progress bi-loader-hidden')
				.change('loader', false, 'bi-loader-hidden');
			this.$element.trigger($.biPlugin.events('loader'), 'error');
		},
		success: function () {
			this.change('content', 'bi-loader-hidden', 'bi-loader-progress')
				.change('loader', false, 'bi-loader-hidden');
			this.$element.trigger($.biPlugin.events('loader'), 'success');
		},
		complete: function () {
			this.change('content', 'bi-loader-hidden', 'bi-loader-progress')
				.change('loader', 'bi-loader-hidden');
			this.$element.trigger($.biPlugin.events('loader'), 'complete');
		},
		remove: function () {
			this.$loader.remove(); // Clean DOM
			this.destroy(); // Destroy plugin instance
		}
	};

	// Generate the new jQuery method $.fn[name]
	$.biPlugin(name, settings, prototype, methods);

})(jQuery);
