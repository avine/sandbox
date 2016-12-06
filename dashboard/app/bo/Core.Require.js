
(function (window, Bi) {
    "use strict";

    var tool = Bi.tool, Core = Bi.Core;

    var Require = Core.module('Require');

    Require.extendStatic({

        OPTIONS: {
            baseUrl: '',
            debug: false
        }

    });

    Require.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Require.OPTIONS, options || {});
        }

    });

    //////////////////////////////////
    // Asynchronous resources loading
    // (with dependencies)

    /*

    // Example:
    // We assumes 'script1_sub.js' depends on 'script1.js' and 'script2_sub.js' depends on 'script2.js'
    // In this example, 'script1.js' and 'script2.js' are loaded asynchronously.
    // When they are loaded, 'script1_sub.js' and 'script2_sub.js' are loaded asynchronously.
    new Bi.Core.Require({ baseUrl: 'path/to/' }).scripts([
    
        'script1.js', 'script2.js'
    ], [
        'script1_sub.js', 'script2_sub.js'
    
    ]).queue(function () {
        alert('All resources loaded according to dependencies !');
    
    }).onFailure(function () {
        alert('One or more resources have not been loaded !');
    
    });

    // end of example */

    // Usage:
    // new Bi.Core.Require().scripts();
    // new Bi.Core.Require().styles();
    // new Bi.Core.Require().images();
    Require.extendAsync({

        baseUrl: function (baseUrl) {
            this.options.baseUrl = baseUrl || '';
            this.done();
        },

        scripts: function (/*urls1, urls2, ..., again*/) {
            _loads.call(this, 'scripts', arguments).done();
        },

        styles: function (/*urls1, urls2, ..., again*/) {
            _loads.call(this, 'styles', arguments).done();
        },

        images: function (/*urls1, urls2, ...*/) {
            _loads.call(this, 'images', arguments).done();
        }

    });

    function _loads(type, args) {
        var again = tool.is.boolean(args[args.length - 1]) ? Array.prototype.pop.call(args) : false;
        Array.prototype.forEach.call(args, function (urls) {
            urls = [].concat(urls);
            if (this.options.baseUrl) for (var i = 0; i < urls.length; i++) urls[i] = this.options.baseUrl + urls[i];
            this.then(function () {
                Require[type](
                    urls,
                    function () { this.done(); }.bind(this),
                    function () { this.fail(); }.bind(this),
                    again
                );
            });
        }.bind(this));
        return this;
    }

    //////////////////////////////////
    // Asynchronous resources loading
    // (without dependencies)

    /*

    // Example: using scripts (parameter `again` available)
    var again = false; // Load scripts once
    Bi.Core.Require.scripts([
        'path/to/script1.js',
        'path/to/script2.js'
    ], function (skipped) {
        if (!skipped) {
            console.log('All scripts loaded!');
        } else {
            console.log(skipped + ' script(s) was already loaded once!');
        }
    }, function (skipped, error) {
        if (skipped) {
            console.log(skipped + ' script(s) was already loaded once!');
        }
        console.error(error + ' script(s) was not loaded!');
    }, again);

    // Example: using images (parameter `again` always true)
    Bi.Core.Require.images([
        'path/to/img1.png',
        'path/to/img2.png'
    ], function (skipped) {
        // Insert in the DOM the loaded images
        document.body.appendChild(this[0]);
        document.body.appendChild(this[1]);
        if (!skipped) {
            console.log('All images loaded!');
        } else {
            console.log(skipped + ' image(s) was already loaded once!');
        }
    }, function (skipped, error) {
        if (!skipped) {
            console.log(skipped + ' image(s) was already loaded once!');
        }
        console.error(error + ' image(s) was not loaded!');
    });

    // end of examples */

    var require = (function () {
        var _loaded = { scripts: [], styles: [], images: [] },
        _load = function (type, url, onLoad, onError, index) {
            var node, attr, parent = window.document.getElementsByTagName('head')[0];
            switch (type) {
                case 'scripts':
                    node = window.document.createElement('script');
                    node.type = 'text/javascript';
                    attr = 'src';
                    break;
                case 'styles':
                    node = window.document.createElement('link');
                    node.type = 'text/css';
                    node.rel = 'stylesheet';
                    attr = 'href';
                    break;
                case 'images':
                    node = new window.Image();
                    attr = 'src';
                    parent = null;
                    break;
            }
            if (undefined !== index) node._index = index;
            node.onload = node.onreadystatechange = function (e) {
                if (this.readyState && 'complete' != this.readyState && 'loaded' != this.readyState) return;
                node.onload = node.onreadystatechange = null;
                _loaded[type].push(url);
                if (onLoad) onLoad.call(this, e || window.event);
            };
            node.onerror = function (e) {
                if (onError) onError.call(this, e || window.event);
            };
            node[attr] = url;
            node.setAttribute('data-source', 'Bi.Core.Require'); // Just for tracking infos...
            if (parent) parent.appendChild(node);
        },
        _loads = function (type, urls, onLoad, onError, again) {
            urls = [].concat(urls); // Preserve parameter and allow string or array
            var total = urls.length, toDo = [], skipped;
            while (urls.length) {
                var url = urls.shift();
                if (url && (again || !tool.array.exists(url, _loaded[type]))) toDo.push(url);
            }
            if (!toDo.length) {
                skipped = total;
                if (onLoad) onLoad.call([], skipped);
                return;
            }
            var remain = toDo.length, error = 0, nodes = [], progress = function (e) {
                if ('error' === e.type) error++;
                nodes[this._index] = ('error' === e.type ? undefined : this);
                delete this._index;
                if (--remain) return;
                if (1 === nodes.length) nodes = nodes[0];
                skipped = total - toDo.length;
                if (!error && onLoad) onLoad.call(nodes, skipped);
                else if (error && onError) onError.call(nodes, skipped, error);
            };
            for (var i = 0; i < toDo.length; i++) _load(type, toDo[i], progress, progress, i);
        },
        scripts = function (urls, onLoad, onError, again) { _loads('scripts', urls, onLoad, onError, again); },
        styles = function (urls, onLoad, onError, again) { _loads('styles', urls, onLoad, onError, again); },
        images = function (urls, onLoad, onError) { _loads('images', urls, onLoad, onError, true); }; // always again
        scripts.loaded = function () { return [].concat(_loaded.scripts); };
        styles.loaded = function () { return [].concat(_loaded.styles); };
        images.loaded = function () { return [].concat(_loaded.images); };
        return { scripts: scripts, styles: styles, images: images };
    })();

    Require.extendStatic({

        scripts: require.scripts,

        styles: require.styles,

        images: require.images

    });

})(this, this.Bi = this.Bi || {});
