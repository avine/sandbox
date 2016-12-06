
////////////////////////////
// jQuery biProgress plugin

(function ($) {

    var name = 'biProgress', // Plugin name

	settings = {
	    rootCss: 'bi-progress',
	    max: 100,
	    value: 0,
	    colorsRange: ['#B42310', '#FA7C07', '#F7CF0A', '#B0E629'], // red, orange, yellow, green
	    title: '',
	    details: '',
	    types: ['error', 'warning', 'success']
	},

	prototype = {

	    init: function () {
	        this.$element.addClass(this.options.rootCss);

	        this.$title = $('<div>').addClass(this.getCss('title'));
	        if (this.options.title) this._content('title', this.options.title);

	        this.$bar = $('<div>').addClass(this.getCss('bar')).appendTo(this.$element);
	        this.$value = $('<div>').appendTo(this.$bar);

	        this.callMethod('value', this.options.value);

	        this.$details = $('<div>').addClass(this.getCss('details'));
	        if (this.options.details) this._content('details', this.options.details);
	    },

	    wakeup: function (options) {
	        if (this.optionsHasChanged) {
	            if ('value' in options) this.callMethod('value', options.value);
	            if ('title' in options) this._content('title', options.title);
	            if ('details' in options) this._content('details', options.details);
            }
	    },

	    getCss: function (suffix) {
	        return this.options.rootCss + '-' + suffix;
	    },

	    matchColor: function () {
	        var percent = parseInt(this.$value.width() / this.$bar.width() * 100, 10), i = 0;
	        for (; i < this.options.colorsRange.length; i++)
	            if (percent <= (i + 1) / this.options.colorsRange.length * 100)
	                return { percent: percent, color: this.options.colorsRange[i] };
	    },

	    _content: function (item, content, type) {
	        var action;
	        switch (item) {
	            case 'title': action = 'prependTo'; break;
	            case 'details': action = 'appendTo'; break;
	            default: return; // Invalid item
	        }
	        var $item = this['$' + item];

	        if (type || null === type || false === type) this.options.types.forEach(function (t) {
	            $item.removeClass(this.getCss(t));
	        }.bind(this));
	        if (type) $item.addClass(this.getCss(type));

	        $item.html(content);
	        if (null === content || false === content) {
	            $item.detach(); // remove item from the DOM
	        } else if (!$item.parent().size()) {
	            $item[action](this.$element); // insert item in the DOM (if necessary)
	        }
	    }

	},

	methods = {

	    value: function (value) {
	        this.value = Math.min(Math.max(value || 0, 0), 100); // between 0 and 100

	        var percent = parseInt(this.value / this.options.max * 100, 10);
	        this.$value.css('width', percent + '%');

	        if (this.token) clearInterval(this.token);
	        if (this.options.colorsRange && this.options.colorsRange.length) {
	            this.token = setInterval(function () {
	                var status = this.matchColor();
	                if (!status || status.percent == percent) {
	                    clearInterval(this.token);
	                } else {
	                    this.$value.css('background-color', status.color);
	                }
	            }.bind(this), 10);
	        }
	    },

	    getValue: function () {
	        return this.value;
	    },

	    reset: function () {
	        if (0 === this.value) return; // No need to reset
	        var css = this.getCss('skipTransition');
	        this.$value.addClass(css);
	        this.callMethod('value', 0);
	        this.$value.delay(80).queue(function () { this.$value.removeClass(css).dequeue(); }.bind(this));
	    },

	    colorsRange: function (colorsRange) {
	        this.options.colorsRange = colorsRange;
	    },

	    title: function (content, type) {
	        this._content('title', content, type);
	    },

	    details: function (content, type) {
	        this._content('details', content, type);
	    }

	};

    // Generate the new jQuery method $.fn[name]
    $.biPlugin(name, settings, prototype, methods);

})(jQuery);
