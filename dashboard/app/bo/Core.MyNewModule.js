
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, Core = Bi.Core;

    // Code generator: replace MyNewModule by what ever you need in the entire script

    var MyNewModule = Core.module('MyNewModule');

    MyNewModule.extendStatic({

        OPTIONS: {
            debug: false
        }

    });

    MyNewModule.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, MyNewModule.OPTIONS, options || {});
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
