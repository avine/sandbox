
////////////////////////
// jQuery biMenu plugin

(function ($) {

	var name = 'biMenu', // Plugin name

	settings = {
		closeDelay: 750, // Set false to disable this feature
		breadcrumbDisabled: false, // "State less" behaviour
		breadcrumbAlwaysVisible: false,
		callback: function (e, details) { },
		tags: ['ul', 'li']
	},

	prototype = {
	    init: function () {
	        this.$menus = this.$element.find(this.options.tags[0]).andSelf();
	        this.$menus.addClass('bi-menu').removeClass('bi-hover-wrap');

			this.$items = this.$menus.children().addClass('bi-hover-jsOut');
			this.tails = [];

		    // In case of rebuild, store the current breadcrumb
			var currentItem = this.callMethod('breadcrumb');
			if (currentItem) currentItem = currentItem.item;

			var _this = this;
			this.$items.each(function () {

				var $item = $(this), tail = {
					item: this,
					$up: $item.parentsUntil(_this.$element[0]).andSelf().not('.bi-menu'),
					$down: $item.find('.bi-menu > *').andSelf()
				};
				if (tail.$down.length > 1) $item.addClass('bi-menu-arrow');
				_this.tails.push(tail);

			}).on($.biPlugin.events('mousedown'), function (e) {
				e.stopPropagation();

				var item = this, $item = $(item), isClosed = $item.hasClass('bi-hover-jsOut'), current;
				_this.tails.forEach(function (tail) {
				    if (item === tail.item) current = tail;
				});

				_this.$items.removeClass('bi-hover-jsOver').addClass('bi-hover-jsOut');
				var $over;
				if (isClosed) {
					$over = $item.hasClass('bi-menu-breadcrumb') ? _this.breadcrumb.$up : current.$up;
				} else {
					$over = current.$up.not($item);
				}
				$over.removeClass('bi-hover-jsOut').addClass('bi-hover-jsOver');

				_this.$element.clearQueue();
				if (1 === current.$down.length && _this.breadcrumb !== current) {
				    if (!_this.options.breadcrumbDisabled) {
				        _this.$items.removeClass('bi-menu-breadcrumb');
				        current.$up.addClass('bi-menu-breadcrumb'); // This is the revelant instruction to skip if breadcrumbDisabled=true 
				    }

					if (false !== _this.options.closeDelay) {
						_this.$element.delay(_this.options.closeDelay).queue(function () {
							_this.$items.removeClass('bi-hover-jsOver').addClass('bi-hover-jsOut');
							_this.$element.dequeue();
						});
					}
					var details = {
						item: current.item,
						previousItem: _this.breadcrumb ? _this.breadcrumb.item : undefined
					};
					if (_this.options.callback) _this.options.callback.call(current.item, e, details);
					_this.$element.trigger($.biPlugin.events('menu'), details);

					_this.breadcrumb = current;
				}

				if (_this.options.breadcrumbAlwaysVisible) {
					_this.$items.filter('.bi-menu-breadcrumb').removeClass('bi-hover-jsOut').addClass('bi-hover-jsOver');
				}
			});
			if (currentItem) this.callMethod('open', currentItem);
		},
		wakeup: function () {

		},
		createMenu: function () {
		    var tag = this.options.tags[0]; // like <ul>
		    // TODO...
		},
		createItem: function (content, attributes) {
		    var tag = this.options.tags[1]; // like <li>
		    return $('<' + tag + '>').append(
                $('<a href="#"></a>').append(content).attr(attributes || {})
            );
		}
	},

	methods = {
		breadcrumb: function () {
			if (this.breadcrumb) return {
				item: this.breadcrumb.item,
				tail: this.breadcrumb.$up
			};
			return null;
		},
		breadcrumbArray: function (sep) {
		    var arr = [];
		    if (this.breadcrumb) this.breadcrumb.$up.each(function () {
		        arr.push($.trim($(this).children(':first-child').text()));
		    });
		    return sep ? arr.join(sep) : arr;
		},
		close: function () {
			this.$items.removeClass('bi-hover-jsOver').addClass('bi-hover-jsOut');
		},
		open: function (item) {
			var index = parseInt(item, 10);
			if (!isNaN(index)) {
				item = this.$items[index]; // Retrieve the item from its index
				if (!item) return;
			}
			var $item = $(item);
			if (!$item.hasClass('bi-menu-breadcrumb')) $item.trigger($.biPlugin.events('mousedown'));
		},

		rebuild: function () {
		    this.callMethod('close');
		    this.$items.off($.biPlugin.events('mousedown'));
		    this.init();
		},
		addItem: function (param, callback) {
		    var $menu = param.menu ? $(param.menu) : this.$element,
                $items = $menu.children(),
                $item = this.createItem(param.content, param.attributes);
		    if (!$items.size() || 'last' === param.index) {
		        $menu.append($item);
		    } else {
		        var $index = $items.eq('first' === param.index ? 0 : parseInt(param.index, 10));
		        if ($index.size()) {
		            $index.before($item);
		        } else {
		            $menu.append($item);
		        }
		    }
		    this.callMethod('rebuild');
		    if (callback) {
		        var menuRoot = this.$element.get(0);
		        $item.on($.biPlugin.events('click'), function (e) {
		            callback.call(this, e, menuRoot);
		        });
		    }
		    return $item.get(0);
		},
		removeItem: function (item, menu) {
		    var removed, index = parseInt(item, 10);
		    if (!isNaN(index)) {
                // item is just an index relative to menu children
		        var $menu = menu ? $(menu) : this.$element;
		        removed = $menu.children().eq(index).remove();
		    } else {
                // item refers to a DOM element that can be removed
		        removed = $(item).remove();
		    }
		    this.callMethod('rebuild');
		    return removed.size() ? removed.get(0) : null;
		}
	};

	// Generate the new jQuery method $.fn[name]
	$.biPlugin(name, settings, prototype, methods);

})(jQuery);
