
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core; // Alias

    Core.Router.controllers.synchro = function (scope, scopeData, scopeBind) {

        if (!Core.User.login()) return tool.console.error('Core.Router.controllers.synchro: user login is missing !');

        var synchroInProgress = false;

        /////////////////////////////////
        // HACK designed for iPad iOS 10
        // ----------------------------
        // The WebSQL database has become extremely slow during the synchronization process.
        // The problem does not happen every time, but especially the first time!
        // To solve this problem, we just had to open the database (using window.openDatabase) and reload the page.
        // In this way, we recovered the WebSQL performances.
        //
        // You should test every future versions of iOS by removing this hack to see if the problem is still relevant...
        //
        if ('WebSql' == database.pipe.local) {
            var hackSessionKey = 'biCoreSynchro.hackLocalDbInitialized',
            hackInitLocalDb = function () {
                database.factory(database.pipe.local, Core.Db.getLocalDbName());
                tool.storage.session(hackSessionKey, true);
                window.location.reload();
            }
            this.addListener(this, Core.Router.EVENTS.CHANGE, function (core, data) {
                if ('/synchro' == data.path && !synchroInProgress) hackInitLocalDb();
            });
            if (!tool.storage.session(hackSessionKey)) {
                hackInitLocalDb();
            } else {
                tool.storage.session(hackSessionKey, null);
            }
        }
        // End of hack
        //////////////

        // Once the user is logged, build the other modules (Context, Dashboard, Filter, Analysis, Message, ...)
        this.factory.build().queue(function () {

            var translate = this.factory.export('Translation', 'translate');

            // Back button
            jQuery(scope.back).click(function (e) {
                e.preventDefault();
                window.history.length ? window.history.back() : this.redirect('/main', true, false);
            }.bind(this));

            // Step 1
            var $loader = jQuery(scope.step1).biLoader({
                css: { 'background-color': 'rgba(0,0,0,.75)' },
                error:
                    '<div style="font-size:2.5em;">' +
                        '<i class="fa fa-globe"></i> &nbsp; ' +
                        translate('_BI_INTERNET_CONNECTION_LOST') +
                    '</div>',
                defaultMethod: 'complete'
            }),
            $progress = jQuery(scope.progress).biProgress(), $button = jQuery(scope.button);

            // Step 2
            var $result = jQuery(scope.step2), $message = jQuery(scope.message);

            // At the end of the step 2, reload the BI on demand in offline mode
            jQuery(scope.reload).click(function () {

                database.run.mode('local');
                Core.User.cleanAllData();

                $result.removeClass('bi-synchro-view');

                this.redirect('/main', true, true);
                window.location.reload();

            }.bind(this));

            // Duplicate progression in notification
            var $progressNotif = jQuery('<div>').biProgress(),
                notification = this.factory.export('Notification', ['add', 'show', 'hide']),
                notifId = notification.add({
                    content: $progressNotif,
                    offRoutes: ['/synchro']
                });

            var progressStatus = function (a, b) {
                $progress.biProgress(a, b);
                $progressNotif.biProgress(a, b);
            },

            summary = function () {
                var time = Core.Synchro.getSynchroTime();
                if (!time) {
                    return translate("_BI_SYNCHRO_NEVER");
                } else {
                    var date = new Date(time);
                    return [
                        translate("_BI_SYNCHRO_LAST_DATE"),
                        '<b>',
                        date.toLocaleDateString(),
                        '-',
                        date.toLocaleTimeString(),
                        '</b>'
                    ].join(' ');
                }
            },

            detail = (function ($table, $rows, $duration) {
                return function (table, rows, duration) {
                    $table.html(table || '');
                    $rows.html(rows ? rows + ' rows' : '');
                    $duration.html(duration ? duration + 'ms' : '');
                };
            })(jQuery(scope.table), jQuery(scope.rows), jQuery(scope.duration)),

            pending = function (title) {
                return title + ' <i class="fa fa-spinner fa-pulse"></i>';
            },

            finish = function (success) {
                if (success) {
                    $button.attr('disabled', false);
                    // If we are already in 'local' mode
                    // then we should force the reload with the new local database synchronized
                    if (database.run.isMode('local')) {
                        Core.Notification.addPending({
                            // This notification will be showed after the page is reloaded...
                            content: '<i class="fa fa-database"></i>&nbsp; ' +
                                translate('_BI_SYNCHRO_SUCCESS')
                        });
                        jQuery(scope.reload).click();
                    }
                } else {
                    progressStatus('reset');
                }
                progressStatus({ title: summary() });
                $button.val(translate('_BI_SYNCHRO_LAUNCH'));
                detail();
                notification.hide(notifId, 2000);
            };

            progressStatus({ title: summary() });
            $button.val(translate('_BI_SYNCHRO_LAUNCH'));

            var log = this.factory.get('Log'), token, now = new Date().getTime(), step;
            log.synchro();

            var biRepository = this.factory.get('Repository');

            var biSynchro = this.factory.get('Synchro'), timeout = undefined;
            biSynchro.addListener(biSynchro, function (e, details) {
                switch (e.type) {
                    case 'start':
                    case 'done':
                    case 'failure':
                    case 'complete':
                        return;

                    // Watch internet connection
                    case Core.Synchro.EVENT.REMOTE_CONNECTION_LOST: $loader.biLoader('error'); break;
                    case Core.Synchro.EVENT.REMOTE_CONNECTION_RESTORED: $loader.biLoader('complete'); break;

                    // Remote
                    case 'synchro.remote.begin':
                        synchroInProgress = true;
                        progressStatus({
                            title: translate('_BI_SYNCHRO_GETTING_REMOTE_DATA'),
                            colorsRange: ['#B42310', '#FA7C07', '#F7CF0A'] // red, orange, yellow
                        });
                        progressStatus('reset');
                        notification.show(notifId);

                        $button.val(translate('_BI_SYNCHRO_CANCEL'));
                        $result.removeClass('bi-synchro-view');
                        $message.html('');

                        step = 'remote';
                        token = log.add('Synchro', step + '.begin'); // Log synchro begin !
                        break;

                    case 'synchro.remote.progress.begin':
                        timeout = setTimeout(function () { detail(pending(details.table)); }, 500);
                        break;

                    case 'synchro.remote.progress.end':
                        clearTimeout(timeout);

                        progressStatus('value', biSynchro.progressValue());
                        detail(details.table, '', details.duration);
                        break;

                    case 'synchro.remote.end':
                        detail();

                        log.update(token, step + '.end');
                        break;

                    // Local
                    case 'synchro.local.tmp.drop.begin':
                        progressStatus({
                            title: translate('_BI_SYNCHRO_CLEANING_DATA') + ' ...',
                            colorsRange: ['#FA7C07', '#F7CF0A', '#B0E629'] // orange, yellow, green
                        });
                        progressStatus('reset');

                        $button.val(translate('_BI_SYNCHRO_CANCEL'));

                        step = 'local';
                        log.update(token, step + '.begin');
                        break;

                    case 'synchro.local.tmp.drop.end':
                        break;

                    case 'synchro.local.tmp.insert.begin':
                        progressStatus({ title: translate('_BI_SYNCHRO_CREATING_TEMPORARY_TABLES') });
                        break;

                    case 'synchro.local.tmp.insert.progress.begin':
                        timeout = setTimeout(function () { detail(pending(details.table)); }, 500);
                        break;

                    case 'synchro.local.tmp.insert.progress.end':
                        clearTimeout(timeout);

                        progressStatus('value', biSynchro.progressValue());

                        var t = details.total, rows = t.queries + (t.all > t.queries ? '/' + t.all : '');
                        detail(details.table, rows, details.total.duration);
                        break;

                    case 'synchro.local.tmp.insert.end':
                        detail();
                        break;

                    case 'synchro.local.drop.begin':
                        progressStatus({ title: translate('_BI_SYNCHRO_CLEANING_DATA') + ' ...' });
                        $button.attr('disabled', true);
                        break;

                    case 'synchro.local.drop.end':
                        break;

                    case 'synchro.local.rename.begin':
                        progressStatus({ title: translate('_BI_SYNCHRO_REPLACING_TABLES') + ' ...' });
                        break;

                    case 'synchro.local.rename.end':
                        finish(true);

                        var perfs = biSynchro.getPerfs(true), perfsHtml = [
                            translate('_BI_SYNCHRO_DURATION_CLIENT') + ': <b>' + perfs.local + '</b>'
                        ];
                        if (perfs.remote) perfsHtml.unshift(
                            translate('_BI_SYNCHRO_DURATION_SERVER') + ': <b>' + perfs.remote + '</b>'
                        );
                        $message.html(perfsHtml.join(' &nbsp; / &nbsp; '));
                        $result.addClass('bi-synchro-view');

                        // Log the synchro end !
                        log.update(token, parseInt((new Date().getTime() - now) / 1000));
                        log.synchro();
                        synchroInProgress = false;
                        break;
                }
                // TODO: placer le debug dans l'HTML...
                if (biSynchro.options.debug) {
                    tool.console.log(e.type + ' ' + (details ? JSON.stringify(details) : '...'));
                }
            });

            // Disable/Enable the launch synchro button
            var disableButton = function (bool) {
                jQuery(scope.wrapper).children('.bi-synchro-wrapper')[
                    undefined === bool || !!bool ? 'addClass' : 'removeClass'
                ]('bi-synchro-disabled');
            };

            // Check remote server connection
            var checkConnection = function (onSuccess) {
                return this.factory.get('Ping').remote().queue(function (reachable) {
                    disableButton(!reachable);
                    if (reachable && onSuccess) onSuccess(reachable);
                });
            }.bind(this);

            // Recheck connection
            jQuery(scope.retry).click(function (e) {
                e.preventDefault();
                checkConnection();
            });

            // Start/stop synchro 
            $button.click(function () {
                $button.delay(100).queue(function () {
                    $button.blur().dequeue(); // Blur effect
                });
                var callback = function () {
                    if (!biSynchro.stackLength()) {
                        biRepository.synchronize().queue(function (success) {
                            success ? biSynchro.launch() : disableButton(true);
                        });
                    } else {
                        finish(false);
                        clearTimeout(timeout);
                        log.update(token, step + '.cancel');
                        biSynchro.fail();
                        synchroInProgress = false;
                    }
                };
                if (biSynchro.isRemoteCompleted()) {
                    // Just completes the local process (even if there's no internet connection)
                    callback();
                } else {
                    // Check internet connection before launch
                    checkConnection(callback);
                }
            });

        }.bind(this));

    };

})(this, this.jQuery, this.Bi = this.Bi || {});
