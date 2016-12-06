
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core;

    var Context = Core.module('Context');

    Context.extendStatic({

        OPTIONS: {
            debug: false
        }

    });

    Context.extendProto({

        // Module constructor
        //builder: function () {
        //
        //},

        initRepository: function (result) {
            this.db = {
                group: database.format.toJson(result[0])[0],
                config: Context.json2Obj(database.format.toJson(result[1]), 'PARAM', 'VALUE'),
                variable: {},
                // Note: The security is not required in offline mode, as it is applied to data during synchronization.
                security: database.run.isMode('remote') ? Context.json2Obj(database.format.toJson(result[3]), 'TABLENAME', 'QUERY') : {}
            };
            this.tmpVariable = database.format.toJson(result[2]);
        }

    });

    Context.extendAsync({

        initVariables: function () {
            this.tmpVariable.forEach(function (variable) {
                variable.QUERY = this.replaceUser(variable.QUERY);
            }.bind(this));
            this.factory.get('Db').multiReads(this.tmpVariable).then(function (results, done) {
                results = results[0];
                for (var i = 0; i < results.length; i++) {
                    var data = results[i].data;
                    if (!data.length) tool.console.error(
                        'Bi.Core.Context.initVariables: query has no result', this.tmpVariable[i]
                    );
                    this.db.variable[this.tmpVariable[i].NAME] = data.length ? data[0][0] : undefined;
                }
                delete this.tmpVariable;
                done();
            }.bind(this)).thenDone(this);
        }

    });

    Context.extendProto({

        get: function (key, field) {
            if (key in this.db) {
                return field ? this.db[key][field] : this.db[key];
            } else {
                tool.console.error('Bi.Core.Context.get: invalid key ', key);
            }
        },

        getConfig: function (param, field) {
            var value = this.get('config', param);
            if (field) value = Context.str2Obj(value)[field];
            switch ((value + '').toLowerCase()) {
                case "false": case "0": return 0;
                case "true": case "1": return 1;
            }
            return value;
        },

        // Overwrite config or create a new config param
        setConfig: function (param, field, value) {
            switch (arguments.length) {
                case 3:
                    var paramObj = Context.str2Obj(this.db.config[param]);
                    paramObj[field] = value;
                    this.db.config[param] = Context.obj2Str(paramObj);
                    break;
                case 2:
                    // The second argument is the 'value' and not the 'field'
                    this.db.config[param] = Context.obj2Str(arguments[1]);
                    break;
                default:
                    tool.console.error('Bi.Core.Context.setConfig: invalid number of arguments ', arguments);
                    break;
            }
        }

    });

    Context.extendStatic({

        json2Obj: function (json, property, value) {
            var o = {};
            for (var i = 0; i < json.length; i++) o[json[i][property]] = json[i][value];
            return o;
        },

        str2Obj: function (str, sep1, sep2) {
            if (tool.is.object(str)) return str;
            var o = {},
                list = tool.string.split(str + '', sep1 || ';');
            for (var i = 0; i < list.length; i++) {
                var item = tool.string.split(list[i], sep2 || '=');
                o[item[0]] = item[1];
            }
            return o;
        },

        obj2Str: function (obj, sep1, sep2) {
            if (!tool.is.object(obj)) return obj + '';
            sep1 = sep1 || ';';
            sep2 = sep2 || '=';
            var str = '';
            for (var p in obj) str += p + sep2 + obj[p] + sep1;
            return str;
        }

    });

    Context.extendProto({

        replaceAll: function (query) {
            // Start with security, because it may contain references to 'user' and/or 'variables'
            ['replaceSecurity', 'replaceVariable', 'replaceSyntax', 'replaceUser'].forEach(function (fn) {
                query = this[fn](query);
            }.bind(this));
            return query;
        },

        replaceSecurity: function (query) {
            query += ' ';
            var founded = [], getId = function (index) {
                return '<<<' + index + '>>>';
            };
            var charIsAfterTable = ['\r', '\n', ' ', ',', ')'],
                wordIsNotAlias = ['where', 'group', 'having', 'inner', 'outer', 'left', 'on', 'order'];

            var security = this.get('security');
            for (var table in security) {
                query = query.replace(new RegExp('\\s' + table, "gi"), function (match, index) {

                    var nextChar = query.substr(index + match.length, 1);
                    if (nextChar && !tool.array.exists(nextChar, charIsAfterTable)) return match;

                    var alias = match;
                    if (' ' == nextChar) {
                        var nextWord = /[a-z]+/i.exec(query.substr(index + match.length));
                        if (nextWord && !tool.array.exists(nextWord[0], wordIsNotAlias)) alias = '';
                    }
                    index = founded.length;
                    founded.push(' (SELECT ' + table + '.* FROM ' + table + ' ' + security[table] + ')' + alias);
                    return getId(index);
                });
            }
            for (var index = 0; index < founded.length; index++) query = query.replace(getId(index), founded[index]);
            return query;
        },

        replaceVariable: function (query) {
            var variables = this.get('variable');
            for (var name in variables) query = query.replace(new RegExp('{' + name + '}', 'g'), variables[name]);
            return query;
        },

        replaceSyntax: function (query) {
            var isRemote = database.run.isMode('remote');
            // In SQL-Server the concatenation operator is "+" but in SQLite it's "||".
            // Unfortunately, we can not just replace all "+" by "||" :-( 
            // To deal with this problem, we are using a non standard function with the reserved name "BiConcat".
            // From now the query :     "BiConcat ¤¤ A ¤ B ¤ C ¤¤"
            // is replaced by :         "A || B || C" (in SQL-Server)
            // and by :                 "A  + B  + C" (in SQLite)
            var concat = isRemote ? '+' : '||';
            query = query.replace(/BiConcat\s*¤¤(.+?(?=¤¤))¤¤/gi, function (outer, inner) {
                return inner.replace(/¤/g, concat);
            });
            if (!isRemote) {
                // Adapt SQL-server syntax to SQLite
                query = query.replace(/substring\(/gi, 'substr(').replace(/len\(/gi, 'length(');
            }
            return query;
        },

        replaceUser: function (query) {
            return query.replace(/:USER/g, Core.User.login());
        }

    });

    Context.extendProto({

        replaceText: function (text, bypassFilter) {
            // "Translation" - like: {{_BI_APPLICATION_NAME}}
            if (this.factory.has('Translation')) {
                text = this.factory.export('Translation', 'replaceText')(text);
            }
            // "Filters" - like: {FID:25:Value}
            // Tip: If the text you are replacing is not automatically updated  
            // when the filters are modified then you should bypass this dynamic part
            if (!bypassFilter && this.factory.has('Filter')) {
                text = this.factory.export('Filter', 'replaceText')(text);
            }
            // "Variables"
            text = this.replaceVariable(text);
            // "Username"
            text = text.replace(/{USER}/g, Core.User.login());
            return text;
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
