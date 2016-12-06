
(function (window, Bi) {
    "use strict";

    var Require = Bi.Core.Require;

    Require.extendAsync('composer', function (prefixUrl) {

        prefixUrl = prefixUrl || '';

        var require = new Require();
        // If "Web SQL Database" is not supported then loads "SQL.js" plugin
        window.openDatabase || require.scripts(prefixUrl + 'plugins/sql.js-master/js/sql.js');
        require.scripts(prefixUrl + 'app/bo/database.js').thenDone(this);

        this.when(

            new Require({ baseUrl: prefixUrl }).styles([
                'app/ui/css/bi.css',
                'plugins/font-awesome/css/font-awesome.min.css'
            ]),

            new Require({ baseUrl: prefixUrl + 'app/ui/js/' }).scripts([
                'biPlugin.js'
            ], [
                'biScreen.js',
                'biRouter.js',
                'biWrap.js',
                'biNavMenu.js',
                'biMenu.js',
                'biLoader.js',
                'biForm.js',
                'biFormButtonGroup.js',
                'biFormTreeView.js',
                'biProgress.js',
                'biModal.js'
            ]),

            new Require({ baseUrl: prefixUrl + 'app/bo/' }).scripts([
                'tool.PivotTable.js',
                'Core.Ping.js',
                'Core.Factory.js',
                'Core.Repository.js',
                'Core.Db.js',
                'Core.Translation.js',
                'Core.User.js',
                'Core.Template.js',
                'Core.Router.js',
                'Core.Context.js',
                'Core.Dashboard.js',
                'Core.Filter.js',
                'Core.Analysis.js',
                'Core.Message.js',
                'Core.Notification.js',
                'Core.Log.js',
                'Core.Synchro.js'
            ], [
                'Core.FactoryLoad.js',
                'Core.FilterProcess.js',
                'Core.AnalysisDisplay.js'
            ])
            .baseUrl(prefixUrl + 'controllers/').scripts([
                'login.js',
                'logout.js',
                'main.js',
                'synchro.js'
            ]),

            /*
            // For an unknown reason, the AmCharts plugin does NOT works properly when loaded from the Bi.Core.Require
            new Require({ baseUrl: prefixUrl + 'plugins/am/' }).scripts([
                'amcharts/amcharts.js'
            ], [
                'amcharts/funnel.js',
                'amcharts/gauge.js',
                'amcharts/pie.js',
                'amcharts/radar.js',
                'amcharts/serial.js',
                'amcharts/xy.js'
            ], [
                'ammap/ammap_amcharts_extension.js',
                'amcharts/exporting/amexport.js',
                'amcharts/exporting/rgbcolor.js',
                'amcharts/exporting/canvg.js'
            ]).styles(
                'ammap/ammap.css'
            ),
            */

            new Require({ baseUrl: prefixUrl + 'plugins/jqwidgets/' }).scripts([
                'globalization/globalize.js',
                'jqx-all.js'
            ]).styles([
                'styles/jqx.base.css',
                'styles/jqx.metro.css'
            ]),

            new Require({ baseUrl: prefixUrl + 'plugins/cryptojs/' }).scripts([
                'md5.js'
            ])
        );

    });

})(this, this.Bi = this.Bi || {});
