
(function (window, jQuery, Bi) {
    "use strict";

    // Pollyfill (target IE 11)
    if (!Array.prototype.fill) Array.prototype.fill = function (value) {
        for (var n = this.length, i = 0; i < n; i++) this[i] = value;
        return this;
    };

    var tool = {

        // Return or check data type (type parameter is optional)
        //      - If 2 arguments are given then the function is checking data against type and returns a boolean
        //        (In this case, type can be a string or an array of strings of the expected types)
        //      - Otherwise the function returns the data type as a string in lower case
        typeOf: function (data, type) {
            var t = Object.prototype.toString.call(data).toLowerCase().match(/\[object\s([a-z]+)\]/)[1];
            return arguments.length < 2 ? t : -1 !== [].concat(type).indexOf(t);
        },

        is: {
            boolean: function (data) {
                return tool.typeOf(data, "boolean");
            },
            number: function (data) {
                return tool.typeOf(data, "number");
            },
            string: function (data) {
                return tool.typeOf(data, "string");
            },
            array: function (data) {
                return tool.typeOf(data, "array");
            },
            object: function (data) {
                return tool.typeOf(data, "object");
            },
            function: function (data) {
                return tool.typeOf(data, "function");
            }
        },

        number: {
            // Return a string representation of the given float number
            format: function (float, options) {
                options = tool.extend({
                    plus: '', // sign
                    minus: '-', // sign
                    thousand: ' ', // separator
                    decimal: ',', // separator
                    precision: false
                }, options || {});

                float = parseFloat(float);
                if (isNaN(float)) return '';

                if (false !== options.precision) float = float.toFixed(options.precision);

                var sign = float < 0 ? options.minus : options.plus;
                float = (Math.abs(float) + '').split('.');

                var dec = float[1];
                dec = dec ? options.decimal + dec : '';

                var int = float[0], length = int.length;
                if (length <= 3) return sign + int + dec;

                var parts = [], from, to, gap = 0;
                do {
                    to = length - gap;
                    from = to - 3;
                    parts.unshift(int.slice(from < 0 ? 0 : from, to));
                    gap += 3;
                } while (from > 0);

                return sign + parts.join(options.thousand) + dec;
            }
        },

        string: {
            // Removes all leading and trailing space characters from the string
            trim: function (str) {
                return (str || '').replace(/\s+/g, ' ').replace(/^\s|\s$/g, '');
            },

            // Splits the string into an array of substrings using separator(s) and apply tool.string.trim to its parts
            // The separator is treated as a string or a regular expression.
            split: function (str, sep, skipEmpty) {
                if (undefined === skipEmpty) skipEmpty = true;
                str = (str || '').split(sep);
                for (var split = [], n = str.length, i = 0; i < n; i++) {
                    str[i] = tool.string.trim(str[i]);
                    if (str[i] || !skipEmpty) split.push(str[i]);
                }
                return split;
            },

            toNumber: function (str) {
                var num = parseFloat(str);
                if (!isNaN(num) && /^\s*(\+|-)?([0-9]+\.?[0-9]*|\.[0-9]+)(e(\+|-)?[0-9]+)?\s*$/.test(str)) {
                    return num; // Looks like a float !
                }
                return NaN;
            }
        },

        array: {
            // Determine whether value exists in array
            exists: function (value, array, strict) {
                if (undefined === strict) strict = true;
                if (strict && Array.indexOf) return -1 !== array.indexOf(value);
                var isEqual = strict ? function (a, b) { return a === b; } : function (a, b) { return a == b; };
                for (var i = 0, n = array.length; i < n; i++) if (isEqual(value, array[i])) return true;
                return false;
            },

            // Return array of unduplicated values
            unique: function (array, strict) {
                for (var newArray = [], n = array.length, i = 0; i < n; i++)
                    if (!tool.array.exists(array[i], newArray, strict)) newArray.push(array[i]);
                return newArray;
            }
        },

        // Duplicate and merge a collection of variables into a data
        extend: function (data/*, addon1, addon2, ...*/) {
            var i, j, n, m, e;
            for (n = arguments.length, i = 1; i < n; i++) {
                if (tool.is.object(arguments[i])) {
                    data = data || {};
                    for (j in arguments[i]) if (arguments[i].hasOwnProperty(j)) {
                        data[j] = tool.extend(null, arguments[i][j]);
                    }
                } else if (tool.is.array(arguments[i])) {
                    data = data || [];
                    for (m = arguments[i].length, j = 0; j < m; j++) {
                        e = tool.extend(null, arguments[i][j]);
                        tool.is.array(data) ? data.push(e) : (data[j] = e);
                    }
                } else {
                    data = arguments[i];
                }
            }
            return data;
        },

        // Return expected signature of arguments
        // Examples :
        // Bi.tool.signature([1      ], [Bi.tool.is.number, Bi.tool.is.boolean]) //  [1, undefined]
        // Bi.tool.signature([1, true], [Bi.tool.is.number, Bi.tool.is.boolean]) //  [1, true]
        // Bi.tool.signature([true   ], [Bi.tool.is.number, Bi.tool.is.boolean]) //  [undefined, true]
        signature: function (args, types) {
            for (var s = [], j = 0, i = 0; i < types.length; i++) s[i] = types[i](args[j]) ? args[j++] : undefined;
            return s;
        },

        // A simple function to debug script performances
        //
        // var myId = Bi.tool.perfs();
        // setTimeout(function () {
        //      console.log( Bi.tool.perfs(myId) ); // Will echo "1.0s"
        // }, 1000);
        //
        perfs: (function () {
            var times = [];
            return function (id) {
                if (undefined === id) {
                    times.push(new Date().getTime());
                    return times.length - 1;
                } else if (times[id]) {
                    var duration = new Date().getTime() - times[id];
                    return duration < 1000 ? duration + 'ms' : (duration / 1000).toFixed(2) + 's';
                } else {
                    return NaN;
                }
            };
        })(),

        url: {
            // Parse URL
            // [protocol]//[host][pathname][search][hash]
            //
            // The returned object contains some interesting properties:
            //
            // o.search = ?search1=value1&search2=value2
            // o.queries = { search1: value1, search2: value2 }
            //
            // o.hash = #/hashPath?hashSearch1=value1&hashSearch2=value2
            // o.hashPathname = /hashPath
            // o.hashQueries = { hashSearch1: value1, hashSearch2: value2 }
            //
            parse: function (url) {
                var o = {}, p = ['origin', 'protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash'],
                    a = window.document.createElement('a'), i, s;

                a.href = url || window.location.href;
                for (i = 0; i < p.length; i++) o[p[i]] = a[p[i]];

                var getQueries = function (s) {
                    s = s ? (s + '').split('&') : [];
                    for (var q = {}, p, i = 0; i < s.length; i++) {
                        p = s[i].split('=');
                        q[p[0]] = decodeURIComponent(p[1] || '');
                    }
                    return q;
                };

                // Server path and search
                o.pathname = '/' + o.pathname.replace(/^\//, '');
                o.queries = getQueries(a.search.replace(/^\?/, ''));

                // Client path and search (for Single page application)
                s = a.hash.replace(/^#/, '').split('?');
                o.hashPathname = '/' + s[0].replace(/^\//, '');
                o.hashQueries = getQueries(s[1]);

                return o;
            },

            // Stringify URL
            stringify: function (o) {
                if (!o) return '';

                var map2Str = function (map) {
                    var str = [], p;
                    for (p in (map || {})) str.push(p + '=' + encodeURIComponent(map[p]));
                    return str.join('&');
                }, clean = function (str, reg) {
                    return (str || '').replace(new RegExp(reg), '');
                };

                var origin = '';
                if (o.origin) {
                    origin = o.origin; // Full origin have priority on contruction from parts (protocol, host, ...)
                } else if (o.host || o.hostname) {
                    origin = (o.protocol || 'http:') + '//' + (o.host || (o.hostname + (o.port ? ':' + o.port : '')));
                }

                var pathname = o.pathname || (origin ? '/' : '');

                var search;
                if (o.queries) { // Use empty object {} to reset search
                    search = map2Str(o.queries); // object have priority on string
                } else {
                    search = clean(o.search, '^\\?'); // string
                }

                var hash;
                if (o.hashQueries) { // Use empty object {} to reset hashQueries
                    var _hQ = map2Str(o.hashQueries); // object have priority on string
                    hash = (o.hashPathname || '') + (_hQ ? '?' + _hQ : '');
                } else {
                    hash = clean(o.hash, '^#'); // string
                }

                return origin + pathname + (search ? '?' : '') + search + (hash ? '#' : '') + hash;
            },

            // Customize URL parts
            //
            // map = {
            //        protocol:        'http:',
            //        hostname:        'www.mysite.com',
            //        port:            '80',
            //        pathname:        '/real/path',
            //        queries:         { q1: 'A', q2: 'B' }, // object
            //        hashPathname:    '/virtual/path',
            //        hashQueries:     { hq1: 'C', hq2: 'D' } // object
            // }
            //
            extend: function (url, map, mergeQueries) {
                var o = tool.url.parse(url), p;

                delete o.origin;
                delete o.host;

                mergeQueries = (undefined === mergeQueries || !!mergeQueries); // default value: mergeQueries=true
                if (mergeQueries) {
                    if (map.queries) {
                        for (p in map.queries) o.queries[p] = map.queries[p]; // deep merge
                        delete map.queries;
                    }
                    if (map.hashQueries) {
                        for (p in map.hashQueries) o.hashQueries[p] = map.hashQueries[p]; // deep merge
                        delete map.hashQueries;
                    }
                }
                tool.extend(o, map);

                return tool.url.stringify(o);
            },

            // Define the constant: Bi.tool.url.ROOT
            //
            // Assuming the website is deployed at location:
            //      http://localhost/MyCountry/dashboard/index.html
            //
            // '/MyCountry' is the subdirectory where the website is deployed
            // and '/dashboard' is the folder that contains all the BI scripts
            //
            // At the begining of the 'index.html' page, you must call:
            //      Bi.tool.url.root('/dashboard');
            //
            // This will make available the following constant:
            //      Bi.tool.url.ROOT; // = "/MyCountry"
            //
            // Notice: the parameter "folder" must be a string but might represent a regular expression!
            //
            root: function (folder, url) {
                delete tool.url.ROOT; // Delete the default writable value
                var pathname = tool.url.parse(url).pathname;
                // pathname not ends with '/' (this is not mandatory, just a fine tuning - comment this line if you have to...)
                pathname = pathname.replace(/\/$/, '');
                if (folder && '/' != folder) {
                    // folder should start with '/'
                    folder = '/' + folder.replace(/^\//, '');
                    // If the folder is specified then remove it and whatever is after
                    pathname = pathname.replace(new RegExp(folder + '.*$', 'i'), '');
                } else {
                    // Otherwise, remove at least the file (like "/index.html")
                    pathname = pathname.replace(/\/?[^\/]+\.html$/, '');
                }
                Object.defineProperty(tool.url, 'ROOT', { value: pathname, writable: false });
            },
            ROOT: '' // Note that minimum ROOT is not "/" but the empty string "".
        },

        html: {
            // Convert html specials characters to entities
            // Example:
            // Bi.tool.html.entities("<div> me & you </div>"); // "&lt;div&gt; me &amp; you &lt;/div&gt;"
            entities: function (str, quotes) {
                str = ((str || '') + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                (undefined === quotes ? ['"', "'"] : (quotes || [])).forEach(function (quote) {
                    str = str.replace(new RegExp(quote, 'g'), '\\' + quote);
                });
                return str;
            },

            // Convert object to string that represents html attributes
            // Example:
            // Bi.tool.html.obj2Attr({ class: 'flash', src: 'servier.fr' }); // ' class="flash" src="servier.fr"'
            obj2Attr: function (obj, prefix) {
                prefix = prefix || '';
                var attr = [];
                for (var prop in obj) attr.push(prefix + prop + '="' + tool.html.entities(obj[prop], ['"']) + '"');
                return attr.length ? ' ' + attr.join(' ') : '';
            },

            // Html tags generator
            // Examples:
            // Bi.tool.html.tag('p', { title:'hello' }, 'world');        // '<p title="hello">world</p>'
            // Bi.tool.html.tag('img', { src:'image.png' }, null);       // '<img src="image.png" />'
            tag: function (name, attr, content, entities) {
                var tag = name + tool.html.obj2Attr(attr || {});
                if (null === content) return '<' + tag + ' />'; // self closed tag
                if (!!entities) content = tool.html.entities(content, false);
                return '<' + tag + '>' + ((content || '') + '') + '</' + name + '>';
            },

            table: function (params) {
                // Build params
                var o = tool.extend({
                    className: '',
                    style: '',
                    caption: '',
                    cols: [],
                    rows: [],
                    stringify: false,
                    entities: false
                }, params || {});
                // Get rows as json
                var rows = [];
                if ('object' == jQuery.type(o.rows)) {
                    for (var p in o.rows) rows.push([p, o.rows[p]]);
                } else {
                    rows = tool.extend(rows, o.rows); // Duplicate original
                }
                // Build html
                var table = '';
                if (o.caption) table += '<caption>' + o.caption + '</caption>';
                if (o.cols && o.cols.length) table += '<tr><th>' + o.cols.join('</th><th>') + '</th></tr>';
                rows.forEach(function (row) {
                    // Stringify content
                    if (o.stringify) row.forEach(function (r, i) {
                        var type = jQuery.type(r);
                        if ('object' == type || 'array' == type) {
                            row[i] = tool.html.stringify(r); // This is a "smooth" stringify (just for object and array...)
                        }
                    });
                    // Remove entities
                    if (o.entities) row.forEach(function (r, i) {
                        row[i] = tool.html.entities(r, false);
                    });
                    table += '<tr><td>' + row.join('</td><td>') + '</td></tr>';
                });
                // Add css
                (o.className = o.className ? [o.className] : []).unshift('bi-table');
                // Return html
                return '<div class="' + o.className.join(' ') + '" style="' + o.style + '"><table>' + table + '</table></div>';
            },

            // Stringify any data into a readable string
            stringify: function (data, compactArray, indent) {
                var tabs = new Array(indent = indent || 0).fill('\t').join(''), prefix = '', str = [];
                if (!arguments[3]) {
                    prefix = tabs;
                    compactArray = undefined === compactArray ? true : !!compactArray;
                }
                switch (tool.typeOf(data)) {
                    case 'array':
                        if (compactArray) {
                            data.forEach(function (item) {
                                str.push(tool.html.stringify(item, compactArray, indent, true));
                            });
                            return prefix + '[' + str.join(', ') + ']';
                        } else {
                            data.forEach(function (item) {
                                str.push(tabs + '\t' + tool.html.stringify(item, compactArray, indent + 1, true));
                            });
                            return prefix + '[\n' + str.join(',\n') + '\n' + tabs + ']';
                        }

                    case 'object':
                        for (var prop in data) {
                            str.push(tabs + '\t"' + prop + '": ' + tool.html.stringify(data[prop], compactArray, indent + 1, true));
                        }
                        return prefix + '{\n' + str.join(',\n') + '\n' + tabs + '}';

                    case 'string':
                        return prefix + '"' + data + '"';

                    default:
                        return prefix + data;
                }
            }

        },

        date: {
            // Example: Bi.tool.date.format("Today mm-dd-yyyy at the time hh:mn:ss");
            format: function (format, date) {
                if (date && !(date instanceof Date)) return false;
                date = date || new Date();    // Default date
                var o = {
                    // Date
                    yyyy: date.getFullYear(),
                    mm: date.getMonth() + 1, // Javascript month starts at 0
                    dd: date.getDate(),
                    // Time
                    hh: date.getHours(),
                    mn: date.getMinutes(),
                    ss: date.getSeconds()
                };
                format = format || 'yyyymmdd'; // Default format
                for (var p in o) format = format.replace(p, (o[p] < 10 ? '0' : '') + o[p]);
                return format;
            }
        },

        language: {
            // Return the browser supported languages
            navigator: function () {
                var n = window.navigator;
                if (tool.is.array(n.languages)) {
                    return n.languages; // Chrome
                } else if (tool.is.string(n.userLanguage)) {
                    return [n.userLanguage]; // IE
                } else {
                    return [];
                }
            },
        },

        cookie: (function () {
            var Cookie = function () { };
            Cookie.prototype = {
                set: function (key, value, expires, path, domain, secure) {
                    var cookie = [], add = function (k, v) { cookie.push(k + '=' + v); };
                    add(key, encodeURIComponent(value || ''));
                    if (expires) {
                        var d = new Date();
                        d.setTime(d.getTime() + 1000 * 60 * 60 * 24 * expires); // days
                        add('expires', d.toUTCString());
                    }
                    add('path', path || '/');
                    if (domain) add('domain', domain);
                    window.document.cookie = cookie.join('; ') + (secure ? '; secure' : '');
                    return this.get(key);
                },
                get: function (key) {
                    var map = {}, cookie = tool.string.split(window.document.cookie, ';');
                    for (var i = 0; i < cookie.length; i++) {
                        var data = tool.string.split(cookie[i], '=');
                        map[data[0]] = decodeURIComponent(data[1] || '');
                    }
                    return key ? map[key] : map;
                },
                have: function (key) {
                    return key in this.get();
                },
                keys: function () {
                    var keys = [], cookie = this.get();
                    for (var k in cookie) keys.push(k);
                    return keys;
                },
                erase: function (key) {
                    var keys, cookie, i;
                    for (keys = key ? [key] : this.keys(), i = 0; i < keys.length; i++) this.set(keys[i], '', -1);
                    for (cookie = this.get(), i = 0; i < keys.length; i++) if (keys[i] in cookie) return false;
                    return true;
                }
            };
            return new Cookie();
        })(),

        // Handle local and session Storage
        // Examples:
        // Bi.tool.storage.session('foo');          // return null (get undefined)
        // Bi.tool.storage.session('foo', 5);       // return 5 (set and get)
        // Bi.tool.storage.session('foo');          // return 5 (get)
        // Bi.tool.storage.sessionSize('foo');      // return 1 (get the size of the stored value)
        // Bi.tool.storage.sessionSize('foo', true);// return "0.00Kb" (get a readable size of the stored value)
        // Bi.tool.storage.session('foo', null);    // return null (remove)
        storage: (function () {
            // Unified method to access storage interface
            var store = function (key, val) {
                if (null === key) {
                    this.clear();
                    return 0; // It means the storage length is now equal to 0
                }
                if (undefined === key) return this.length; // Get storage length

                if (null === val) {
                    this.removeItem(key); // Delete
                } else if (undefined === val) {
                    return JSON.parse(this.getItem(key)); // Get
                } else {
                    try {
                        this.setItem(key, JSON.stringify(val)); // Set
                        return JSON.parse(this.getItem(key));
                    } catch (e) {
                        tool.console.error('Bi.tool.storage: Web storage error occured for key="' + key + '"', e);
                    }
                }
            }, size = function (key, readable) {
                var bytes = window.unescape(encodeURIComponent(this.getItem(key) || '')).length,
                    Kbytes = (bytes / 1024).toFixed(2),
                    Mbytes = (bytes / 1048576).toFixed(2);
                return !readable ? bytes : ('0.00' != Mbytes ? Mbytes + 'Mb' : Kbytes + 'Kb');
            };
            return {
                local: function (key, val) {
                    return store.call(localStorage, key, val);
                },
                session: function (key, val) {
                    return store.call(sessionStorage, key, val);
                },
                localSize: function (key, readable) {
                    return size.call(localStorage, key, readable);
                },
                sessionSize: function (key, readable) {
                    return size.call(sessionStorage, key, readable);
                }
            };
        })(),

        // IndexedDB
        //
        // Code example:
        //
        // if (tool.Idb.isAvailable()) {
        //        var idb = new tool.Idb(undefined, undefined, undefined, function () {
        //            // In this scope: (this === idb)
        //            console.log('All stored items: ', this.items);
        //            var myId = 'myId' + parseInt(Math.random() * 100);
        //            this.add(myId, parseInt(Math.random() * 100), function () {
        //                console.log('New value added: ', myId, this.get(myId));
        //            });
        //        });
        // }
        Idb: (function () {

            function Idb(name, version, storeName, onSuccess, onError) {
                this.items = {};

                name = name || 'defaultDatabase';
                storeName = storeName || 'defaultStore';

                var request = window.indexedDB.open(name, version || 1);

                request.onupgradeneeded = function (e) {
                    if (onError) e.target.transaction.onerror = onError;
                    var db = e.target.result;
                    if (db.objectStoreNames.contains(storeName)) db.deleteObjectStore(storeName);
                    db.createObjectStore(storeName, { keyPath: "id" });
                };

                request.onsuccess = function (e) {
                    this.db = e.target.result;
                    this.storeName = storeName;
                    this._init(onSuccess, onerror);
                }.bind(this);

                if (onError) request.onerror = onError;
            }

            Idb.isAvailable = function () {
                return 'indexedDB' in window;
            };

            Idb.prototype = {

                _getCurrent: function () {
                    var current = {};
                    current.trans = this.db.transaction([this.storeName], "readwrite");
                    current.store = current.trans.objectStore(this.storeName);
                    return current;
                },

                _init: function (onSuccess, onError) {
                    var current = this._getCurrent(),
                        keyRange = window.IDBKeyRange.lowerBound(0),
                        request = current.store.openCursor(keyRange);

                    request.onsuccess = function (e) {
                        var result = e.target.result;
                        if (!result) {
                            if (onSuccess) onSuccess.bind(this)();
                            return;
                        }
                        this.items[result.value.id] = result.value.data;
                        result.continue();
                    }.bind(this);

                    if (onError) request.onerror = onError;
                },

                add: function (id, data, onSuccess, onError) {
                    var current = this._getCurrent(),
                        request = current.store.put({ "id": id, "data": data });

                    current.trans.oncomplete = function (e) {
                        this.items[id] = data;
                        if (onSuccess) onSuccess.bind(this)();
                    }.bind(this);

                    if (onError) request.onerror = onError;
                },

                del: function (id, onSuccess, onError) {
                    var current = this._getCurrent(),
                        request = current.store.delete(id);

                    current.trans.oncomplete = function (e) {
                        delete (this.items[id]);
                        if (onSuccess) onSuccess.bind(this)();
                    }.bind(this);

                    if (onError) request.onerror = onError;
                },

                get: function (id) {
                    return this.items[id]; // synchronous method (there's no onSucces() and onError() callbacks...)
                }

            };

            return Idb;

        })(),

        // Cross browser console
        consoleWindow: (function () {
            return {
                log: function () { c("log", arguments); },
                warn: function () { c("warn", arguments); },
                error: function () { c("error", arguments); }
            };
            function c(t, m) { // c=console ; t=type ; m=messages
                if (window.console) switch (m.length) {
                    case 0: break;
                    case 1: window.console[t](m[0]); break;
                    case 2: window.console[t](m[0], m[1]); break;
                    case 3: window.console[t](m[0], m[1], m[2]); break;
                    case 4: window.console[t](m[0], m[1], m[2], m[3]); break;
                    case 5: window.console[t](m[0], m[1], m[2], m[3], m[4]); break;
                    default: window.console.error("Bi.tool.console: Unable to display messages. " +
                            "The function doesn't handle more than 5 arguments."); break;
                }
            }
        })(),

        // Console that display logs inside the document
        consoleDocument: (function () {
            // Definition
            var targetSelector = 'body',
            $console = jQuery(
                '<div id="bi-console" class="bi-font bi-console-collapse">' +
                    '<div id="bi-console-toggle"></div>' +
                    '<div id="bi-console-clear"></div>' +
                    '<div id="bi-console-content"></div>' +
                '</div>'
            ),
            $content = $console.children('#bi-console-content');
            // Events
            $console.children('#bi-console-toggle').click(function () {
                $console.toggleClass('bi-console-collapse');
            });
            $console.children('#bi-console-clear').click(function () {
                $content.html('');
                $console.addClass('bi-console-collapse');
            });
            // Methods
            var ready = 0,
            show = function () {
                if (0 === ready || 0.5 === ready) return (ready = 0.5);
                if (!$console.parent().size()) $console.appendTo(targetSelector);
            },
            hide = function () {
                if ($console.parent().size()) $console.detach();
            },
            getContent = function (args, type) {
                var html = [];
                Array.prototype.forEach.call(args, function (a) {
                    a = tool.html.stringify(a).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    html.push(a);
                });
                return '<div class="bi-console-' + type + '">' + html.join('<hr />') + '<div>';
            },
            display = function (type, args) {
                if (!args.length) return;
                show();
                $content.append(getContent(args, type));
                if (!$console.hasClass('bi-console-collapse')) {
                    $content.clearQueue().animate({ scrollTop: $content.prop('scrollHeight') }, 500);
                }
            };
            // In case the method .show() has been called before the document is ready
            jQuery(window.document).ready(function () {
                if (0.5 == ready) { ready = 1; show(); } else { ready = 1; }
            });
            return {
                show: show,
                hide: hide,
                log: function () { display('log', arguments); },
                warn: function () { display('warn', arguments); },
                error: function () { display('error', arguments); }
            };

        })()

    };

    // Console that display logs in the window or in the document according to configuration
    tool.console = (function () {
        var _type = window.location.hash.match(/biconsole=(window|document)/i);
        _type = _type ? _type[1].toLowerCase() : tool.storage.session('biToolConsole');
        _type = tool.storage.session('biToolConsole', _type || 'window'); // = 'window' or 'document'
        var _method = _type == 'document' ? 'consoleDocument' : 'consoleWindow';
        return {
            type: function (t) {
                if (undefined === t) return _type;
                if ('document' !== t && 'window' !== t) return false; // Invalid parameter
                _type = tool.storage.session('biToolConsole', t);
                _method = _type == 'document' ? 'consoleDocument' : 'consoleWindow';
                tool.consoleDocument['document' == _type ? 'show' : 'hide']();
                return true;
            },
            log: function () { tool[_method].log.apply(tool[_method], arguments); },
            warn: function () { tool[_method].warn.apply(tool[_method], arguments); },
            error: function () { tool[_method].error.apply(tool[_method], arguments); }
        };
    })();

    // Force the links to directly affect the window.location.href
    // (to be sure that all links are opened in the current window)
    //
    // It's designed for web-app-capable (when the website is launched from the iPad desktop icon).
    // Unfortunately, sometimes, the links are opened in the Safari Browser - instead of the webapp itself...
    // This function solve the problem.
    tool.forceLink2WindowLocation = (function () {
        var handlers = [], debug = false;
        return {
            // You can define optional "css" that will be matched when catching links
            // The "mustHaveCss" parameter tells if the link must have or must NOT have the defined "css"
            on: function (dom, css, mustHaveCss) {
                var handler = [jQuery(dom), function (e) {
                    if ('a' !== e.target.nodeName.toLowerCase()) return; // Match <a> (required)
                    if ('_blank' == e.target.target) return; // Check target attribute with "_blank" value
                    if (e.target.download) return; // Check download attribute (must be not empty)
                    if (css) { // Match expected or not exptected css class (optional)
                        var hasCss = jQuery(e.target).hasClass(css);
                        if (mustHaveCss && !hasCss || !mustHaveCss && hasCss) return;
                    }
                    if (e.isDefaultPrevented()) return; // Check default prevented
                    e.preventDefault();
                    window.location.href = e.target.href;
                    if (debug) alert('Bi.tool.forceLink2WindowLocation:\n' + e.target.href);
                }];
                handler[0].on('click', handler[1]);
                handlers.push(handler);
            },
            off: function () {
                handlers.forEach(function (handler) {
                    handler[0].off('click', handler[1]);
                });
                handlers.length = 0; // empty the array
            },
            debug: function (status) {
                if (undefined !== status) {
                    debug = !!status; // boolean
                } else {
                    tool.console.log('Bi.tool.forceLink2WindowLocation: ' +
                        handlers.length + ' handled DOM node(s)');
                    handlers.forEach(function (handler) { tool.console.log(handler[0].get(0)); });
                }
            }
        };
    })();

    // Expose
    Bi.tool = tool;

})(this, this.jQuery, this.Bi = this.Bi || {});
