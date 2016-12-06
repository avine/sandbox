
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, Core = Bi.Core;

    var Template = Core.module('Template');

    Template.extendStatic({

        OPTIONS: {
            views: '/dashboard/views', // base path the templates directory

            extension: 'html', // template extension name

            useCache: true,

            // Suffix of the data attribute
            //
            // Assuming the template contains: <div data-biz-bind="myNode"></div>
            // Template.bindHtml() returns an object:
            // {
            //      $html: jQuery('<div data-biz-bind="myNode"></div>'),
            //      scope = { myNode: jQuery('[data-biz-bind="myNode"]').get(0) }
            // }
            dataBindAttr: 'biz-bind',

            debug: false
        }

    });

    Template.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Template.OPTIONS, options || {});
            if (this.options.views) {
                this.options.views = this.options.views.replace(/\/$/, '') + '/'; // base path ends with a '/'
            }
        },

        // Get full path to template file
        getPath: function (template) {
            return tool.url.ROOT + this.options.views + template.replace(/^\//, '') + '.' + this.options.extension;
        }

    });

    Template.extendAsync({

        // Load html template from server of from cache when available
        load: function (template) {
            var useCache = this.options.useCache && !this.options.debug,
                path = this.getPath(template),
                html = useCache ? Template.cache(path) : undefined;
            if (undefined === html) {
                jQuery.get(path, function (html) {
                    if (useCache) Template.cache(path, html);
                    this.done(html);
                }.bind(this));
            } else {
                this.done(html);
            }
        },

        // Load html template and bind its content against special attributes
        process: function (template, preprocessHtml) {
            this.load(template).then(function (html) {
                // Preprocess (use this feature ONLY for string (NOT dom) manipulation)
                if (preprocessHtml) {
                    var _html = preprocessHtml(html);
                    if (undefined !== _html) html = _html;
                }
                // Translate
                if (this.factory && this.factory.has && this.factory.has('Translation')) {
                    html = this.factory.export('Translation', 'replaceText')(html);
                }
                // Bind html and returns a jQuery object $html and an asscociated map scope
                this.done(Template.bindHtml(html, this.options.dataBindAttr));
            }).done();
        }

    });

    Template.extendStatic({

        // Bind html against specials special attributes and implement "one way" data binding
        bindHtml: function (html, dataBindAttr) {
            // Wrap html to be able to use jQuery .bind() properly
            var $wrap = jQuery('<div>' + html + '</div>'),
                // Unwrap html and prepare the return of the method
                o = { $html: $wrap.children(), scope: {}, data: {}, bind: {} };
            // Get the bind attribute
            dataBindAttr = dataBindAttr || Template.OPTIONS.dataBindAttr;
            // Fill html o.scope
            $wrap.find('[data-' + dataBindAttr + ']').each(function () {
                o.scope[jQuery(this).data(dataBindAttr)] = this;
            });
            // Observe o.data items and bind modifications via the o.bind items callback function
            var _values = {};
            for (var item in o.scope) (function (item) {
                Object.defineProperty(o.data, item, {
                    get: function () {
                        return _values[item];
                    },
                    set: function (newValue) {
                        _values[item] = newValue;
                        // Propagate new value to the callback when defined
                        if (o.bind[item]) o.bind[item].call(o.scope[item], newValue);
                    }
                });
            })(item);
            return o;
        },

        // Search and replace the pattern {{KEY}}
        replaceHtml: function (html, replacements) {
            for (var key in replacements) html = html.replace(new RegExp('{{' + key + '}}', 'g'), replacements[key]);
            return html;
        },

        // Set and Get template cache
        cache: function (path, html) {
            var cache = tool.storage.session('biCoreTemplate.cache') || {};
            switch (arguments.length) {
                case 0:
                    return cache;
                case 1:
                    return cache[path];
                case 2:
                    cache[path] = html;
                    tool.storage.session('biCoreTemplate.cache', cache);
                    return html;
            }
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
