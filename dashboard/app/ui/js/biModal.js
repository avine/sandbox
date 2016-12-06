
/////////////////////////
// jQuery biModal plugin

(function ($) {

    var name = 'biModal', // Plugin name

	settings = {
	    rootCss: 'bi-modal',
	    title: '',
	    content: '',

	    close: true, // Boolean to add close button in the title area

        cancel: '', // Text of the cancel button (leave empty to disable)
        confirm: '', // Text of the confirm button (leave empty to disable)

	    // Callbacks (note: onCancel is triggered when clicking on the 'cancel' button or 'close' button)
	    onCancel: undefined, // function (e, d) { console.log(this, e, d); }
	    onConfirm: undefined, // function (e, d) { console.log(this, e, d); }

        // Size (in pixel or percent)
	    width: undefined,
	    height: undefined
	},

	prototype = {

	    init: function () {
	        this.$element.addClass(this.options.rootCss).children().size() ?
                this.parseDom() :
                this.createDom();

	        if (this.$close) this.$close.on('click', function (e) {
	            this.action('cancel', e);
	        }.bind(this));
	        
	        if (this.$cancel) this.$cancel.on('click', function (e) {
	            this.action('cancel', e);
	        }.bind(this));
	        
	        if (this.$confirm) this.$confirm.on('click', function (e) {
	            this.action('confirm', e);
	        }.bind(this));
	        
	        if (this.options.title) this.$top.append(this.options.title);
	        if (this.options.content) this.$middle.append(this.options.content);
	    },

	    wakeup: function () {
	        if (this.options.width) this.$root.css('width', this.options.width);
	        if (this.options.height) this.$middle.css('height', this.options.height);
	    },

	    getCss: function (suffix) {
	        return this.options.rootCss + '-' + suffix;
	    },

	    parseDom: function () {
	        this.$root = this.$element.children(); // Should be one node
	        this.$top = this.$root.children('.' + this.getCss('top'));
	        this.$middle = this.$root.children('.' + this.getCss('middle'));
	        this.$bottom = this.$root.children('.' + this.getCss('bottom'));

	        if (this.$top.size()) {
	            this.$close = this.$top.children('.' + this.getCss('close'));
	        }
	        if (this.$bottom.size()) {
	            this.$cancel = this.$bottom.children('.' + this.getCss('cancel'));
	            this.$confirm = this.$bottom.children('.' + this.getCss('confirm'));
	        }
	    },

	    createDom: function () {
	        this.$root = $('<div>');
	        if (this.options.title || this.options.close) {
	            this.$top = $('<div>').addClass(this.getCss('top')).appendTo(this.$root);
	            if (this.options.close) this.$close = $('<div>').addClass(this.getCss('close')).appendTo(this.$top);
	        }
	        this.$middle = $('<div>').addClass(this.getCss('middle')).appendTo(this.$root);

	        if (this.options.cancel || this.options.confirm) {
	            this.$bottom = $('<div>').addClass(this.getCss('bottom')).appendTo(this.$root);

	            if (this.options.cancel) {
	                this.$cancel = $('<button>').addClass(this.getCss('cancel')).text(this.options.cancel).appendTo(this.$bottom);
	            }
	            if (this.options.confirm) {
	                this.$confirm = $('<button>').addClass(this.getCss('confirm')).text(this.options.confirm).appendTo(this.$bottom);
	            }
	        }
	        this.$root.appendTo(this.$element);
	    },

	    action: function (type, event) {
	        var callback = this.options['cancel' == type ? 'onCancel' : 'onConfirm'];
	        if (callback) callback.call(this.$element, event, type);
	        this.$element.trigger($.biPlugin.events('modal'), type).remove();
	    }

	},

	methods = {
		
	    content: function (content, replace) {
	        this.$middle[replace ? 'html' : 'append'](content);
	    },

	    cancel: function () {
	        this.action('cancel');
	    },

	    confirm: function () {
	        this.action('confirm');
	    }

	};

	// Generate the new jQuery method $.fn[name]
	$.biPlugin(name, settings, prototype, methods);

})(jQuery);
