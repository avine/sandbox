
////////////////////////
// jQuery biWrap plugin

(function ($) {

	var name = 'biWrap', // Plugin name

	settings = {
		hide: {
			top: false,
			bottom: false,
			sidebar: false,
			head: false
		},
		hideTrigger: {
			top: false,
			bottom: false,
			sidebar: false
		},
		fixedMain: false
	},

	prototype = {
		init: function () {
			this.$bag = {
				wrap: this.$element,
				top: this.$element.find('.bi-top'),
				middle: this.$element.find('.bi-middle'),
				bottom: this.$element.find('.bi-bottom')
			};

            // Skip transitions while init process
			this.$bag.wrap.addClass('bi-wrap-skipTransition').delay(500).queue(function () {
			    $(this).removeClass('bi-wrap-skipTransition').dequeue();
			});

			this.$bag.main = this.$bag.middle.find('.bi-main');
			this.$bag.sidebar = this.$bag.middle.find('.bi-sidebar');

			this.$bag.topTrigger = this.$bag.top.find('.bi-toggle-trigger');
			this.$bag.bottomTrigger = this.$bag.bottom.find('.bi-toggle-trigger');
			this.$bag.sidebarTrigger = this.$bag.sidebar.find('.bi-toggle-trigger');

			var _this = this;
			this.$bag.topTrigger.on('click', function () {
				_this.handleAction('toggle', 'top');
			});
			this.$bag.bottomTrigger.on('click', function () {
				_this.handleAction('toggle', 'bottom');
			});
			this.$bag.sidebarTrigger.on('click', function () {
				_this.handleAction('toggle', 'sidebar');
			});

			this.callMethod('handleMainToggler', '.bi-sidebar-switcher');
		},
		wakeup: function () {
			if (!this.isInit && !this.optionsHasChanged) return;

			var options = this.options.hide, layout;
			for (layout in options) {
			    if (this.isInit) {
			        if (options[layout]) this.handleAction('hide', layout);
			    } else {
			        this.handleAction(options[layout] ? 'hide' : 'show', layout);
			    }
			}
			options = this.options.hideTrigger;
			for (layout in options) {
			    if (this.isInit) {
			        if (options[layout]) this.handleAction('hide', layout, true);
			    } else {
			        this.handleAction(options[layout] ? 'hide' : 'show', layout, true);
			    }
			}

			this.handleAction(this.options.fixedMain ? 'fixed' : 'fluid', 'main');
		},
		handleBag: function (bag, method, className) {
			this.$bag[bag][method](className);
		},
		handleAction: function (action, layout, trigger) {
			trigger = !!trigger ? '-trigger' : '';
			var method = { show: 'removeClass', hide: 'addClass', toggle: 'toggleClass' };
			switch (layout) {
				case 'top':
				case 'bottom':
					this.handleBag('wrap', method[action], 'bi-hide-' + layout + trigger);
					break;
			    case 'sidebar':
					this.handleBag('middle', method[action], 'bi-hide-' + layout + trigger);
					break;
				case 'head':
					this.handleBag('main', method[action], 'bi-hide-head');
					break;
				case 'main':
					method = { fluid: 'removeClass', fixed: 'addClass', toggle: 'toggleClass' }; // specials actions
					this.handleBag('middle', method[action], 'bi-main-fixed');
					break;
			}
		}
	},

	methods = {
		show: function (layout, trigger) {
			this.handleAction('show', layout, trigger);
		},
		hide: function (layout, trigger) {
			this.handleAction('hide', layout, trigger);
		},
		toggle: function (layout, trigger) {
			this.handleAction('toggle', layout, trigger);
		},
	    // This method allows you to change the sidebar behavior, using the boolean parameter isFixed (false by default)
	    // Tip: if you need to toggle the sidebar behavior call the following method (like in the method handleMainToggler):
	    //      $(selector).biWrap('toggle', 'main');
		fixedMain: function (isFixed) {
			this.handleAction(isFixed ? 'fixed' : 'fluid', 'main');
		},
		isFixedMain: function () {
		    return this.$bag.middle.hasClass('bi-main-fixed');
		},
		handleMainToggler: function (selector) {
			var _this = this;
			$(selector).click(function (e) {
				e.preventDefault();
				_this.handleAction('toggle', 'main');
			});
		}
	};

	// Generate the new jQuery method $.fn[name]
	$.biPlugin(name, settings, prototype, methods);

	// Configuration shortcuts
	$.fn[name].config = {
		simple: {
			hide: { sidebar: true },
			hideTrigger: { top: true },
			fixedMain: true
		}
	};

})(jQuery);
