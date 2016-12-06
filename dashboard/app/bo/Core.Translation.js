
(function (window, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core;

    var Translation = Core.module('Translation');

    Translation.extendStatic({

        OPTIONS: {
            debug: false
        },

        // List of requested keys during the application life
        requestedKeys: (function () {
            function view() {
                var list, sort = function (a) { return a.sort(function (x, y) { return x == y ? 0 : x < y ? -1 : 1 }); };
                if ((list = sort(view._translated)).length) tool.console.log('--- Translated keys ---\n' + list.join('\n'));
                if ((list = sort(view._untranslated)).length) tool.console.warn('--- Untranslated keys ---\n' + list.join('\n'));
            }
            view._add = function (key, available) {
                var list = view[available ? '_translated' : '_untranslated'];
                tool.array.exists(key, list) || list.push(key);
            };
            view._translated = [];
            view._untranslated = [];
            return view;
        })()

    });

    Translation.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Translation.OPTIONS, options || {});
        },

        initRepository: function (results) {
            var dbCulture = database.format.toJson(results[0]), culture = {},
                dbTranslation = database.format.toJson(results[1]), translation = {},
                i;
            for (i = 0; i < dbCulture.length; i++) {
                culture[dbCulture[i].ID] = dbCulture[i].CULTURE;
                translation[dbCulture[i].ID] = {};
            }
            for (i = 0; i < dbTranslation.length; i++) {
                translation[dbTranslation[i].CULTUREID][dbTranslation[i].NAME] = dbTranslation[i].VALUE;
            }
            this.db = {
                culture: culture,
                translation: translation
            };
        },

        add: function (culture, translation) {
            var intVal = parseInt(culture, 10), strVal = culture + '';
            for (var id in this.db.culture) {
                if (parseInt(id, 10) === intVal || this.db.culture[id] === strVal) {
                    for (var key in translation) this.db.translation[id][key] = translation[key];
                    return true;
                }
            }
            return false;
        },

        cultureId: function (value) {
            this.culture(value);
            return this._cultureId;
        },

        culture: function (value) {
            // Get or set the stored cultureId
            var stored = function (id) {
                return tool.storage.local('biCoreTranslation.cultureId', parseInt(id, 10) || undefined);
            };
            if (!this._cultureId) {
                var id = stored();
                // Because this method can be called from a clone instance,
                // use the method 'setter' to affect the original instance and not only the clone.
                if (id && id in this.db.culture) {
                    // Set culture from stored value
                    this.setter('_cultureId', id);
                } else {
                    // Set culture from browser language
                    tool.language.navigator().forEach(function (language) {
                        for (id in this.db.culture) if (language == this.db.culture[id]) {
                            this.setter('_cultureId', stored(id));
                            break;
                        }
                    }.bind(this));
                    if (!this._cultureId) for (id in this.db.culture) {
                        // Pick the culture with the lowest id
                        this.setter('_cultureId', stored(id));
                        break;
                    }
                }
            }
            if (undefined !== value) {
                var intVal = parseInt(value, 10), strVal = value + '';
                for (var id in this.db.culture) 
                    if (parseInt(id, 10) === intVal || this.db.culture[id] === strVal)
                        this.setter('_cultureId', stored(id));
            }
            return this.db.culture[this._cultureId];
        },

        // About the naming convention, there's 2 types of translation keys:
        //
        //  - Website Key: defined in 'BiRepo_Translation.TranslationKey' only for a specific Website.
        //      * Not prefixed - like: {{GROWTH}} (for example, it may appear in the title of an analysis)
        //      * Or prefixed by {{BI_*}} - like: {{BI_GROWTH}}
        //
        //  - System Key: defined in 'BiRepo_Translation.TranslationKey' but hard coded in the application
        //      (like in a .html template or a .js script).
        //      * Prefixed by {{_BI_*}} - like: {{_BI_APPLICATION_NAME}}
        //
        translate: function (key, cultureId) {
            key = tool.string.trim(key);
            cultureId = cultureId || this.cultureId();

            if (cultureId && key in this.db.translation[cultureId]) {
                Translation.requestedKeys._add(key, true);
                return this.db.translation[cultureId][key]; // Translate
            }

            Translation.requestedKeys._add(key, false);
            return '{{' + key + '}}'; // Mark that the key has not been translated
        },

        // Replace keys in any text, using the pattern {{KEY}} 
        replaceText: function (text, cultureId) {
            // Nested keys not supported (like: "{{abc{{def}}ghi}}") 
            return text.replace(/{{(.+?(?=}}))}}/g, function (match) {
                return this.translate(match.substr(2, match.length - 4), cultureId);
            }.bind(this));
        }

    });

})(this, this.Bi = this.Bi || {});
