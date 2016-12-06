
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core; // Alias

    Core.Router.controllers.login = function (scope, scopeData, scopeBind) {

        var router = this,
            user = this.factory.get('User'),
            addNotif = this.factory.export('Notification', 'add');

        var handleModeChange = function (fn) {
            // Register a callback which is invoked each time the field "mode" is changed.
            jQuery(scope.mode).change(function (e, data) {
                fn('remote' == jQuery(this).val(), data); // this == scope.mode
            });
            // Return the callback that can be invoked manually at any time.
            return function (data) {
                fn('remote' == jQuery(scope.mode).val(), data);
            }
        };
        
        var lastLogin = Core.User.lastLogin();

        jQuery(scope.usernameRemote).val(lastLogin); // default usernameRemote!

        // Fill synchronized user options (dedicated to offline mode)
        var synchroUsers = Core.Synchro.getSynchronizedUsers();
        synchroUsers.forEach(function (login) {
            var selected = lastLogin == login ? ' selected' : ''; // default usernameLocal!
            jQuery(scope.usernameLocal).append('<option' + selected + '>' + login + '</option>');
        });
        // Is the "mode" field disabled ?
        if (!synchroUsers.length) jQuery(scope.mode).attr({
            'disabled': true,
            'data-disable-fields': 'bypass'
        });
        // Is the "mode" feature available ?
        if (!user.databaseModeSwitch) {
            jQuery(scope.modeWrapper).addClass('bi-display-none');
        }

        // Handle which username field is displayed.
        // There's 2 ways to enter the username:
        //      - a simple <input> (dedicated to online mode)
        //      - a <select> containing the list of synchronized users (dedicated to offline mode)
        var handleUsername = handleModeChange(function (isModeRemote, data) {
            // Switch between the <input> and <select>
            jQuery(scope.wrapper)[isModeRemote ? 'removeClass' : 'addClass']('bi-login-username-switch');
            // Bind the value between Remote and Local username (unless data == 'NoBinding')
            var $target = jQuery(scope[isModeRemote ? 'usernameRemote' : 'usernameLocal']),
                $source = jQuery(scope[isModeRemote ? 'usernameLocal' : 'usernameRemote']);
            ('NoBinding' == data) || $target.val($source.val());
        });

        // Get the revelant username
        var getUsername = function () {
            return jQuery(scope['remote' == jQuery(scope.mode).val() ? 'usernameRemote' : 'usernameLocal']).val();
        };

        var changePassword = false;
        // To use properly the tabindex, we need to disable the passwordNew* fields if changePassword is not requested
        var handlePasswordTabindex = function () {
            ['passwordNew', 'passwordNewConfirm'].forEach(function (input) {
                jQuery(scope[input]).attr({
                    'disabled': !changePassword,
                    'data-disable-fields': !changePassword ? 'bypass' : null
                });
            });
        };
        // Init the passwordNew* fields
        handlePasswordTabindex();
        // Handle the "Change password" button
        jQuery(scope.changePassword).click(function (e) {
            e.preventDefault();
            changePassword = jQuery(scope.wrapper).toggleClass('bi-login-password-switch').hasClass('bi-login-password-switch');
            handlePasswordTabindex();
        });

        // The "Change password" feature is only available in online mode
        var handlePassword = handleModeChange(function (isModeRemote, event, data) {
            jQuery(scope.changePassword).css('display', isModeRemote ? 'inline' : 'none');
            if (changePassword && !isModeRemote) jQuery(scope.changePassword).trigger('click');
        });

        // Culture options
        var translation = this.factory.export('Translation', ['db', 'cultureId', 'translate']), options = [], id;
        for (id in translation.db.culture) options.push(
            '<option value="' + id + '"' + (translation.cultureId() == id ? 'selected' : '') + '>' +
                translation.db.culture[id] + '</option>'
        );
        jQuery(scope.language).append(options).change(function () {
            translation.cultureId(jQuery(this).val());
            // Reload to view the login page in the new culture (unless the password field is already filled...)
            if (!jQuery(scope.password).val()) window.location.reload();
        });

        // Show message
        var $msg = jQuery(scope.message).children(), showMessage = function (key) {
            $msg.removeClass('bi-login-message-show');
            if (key) $msg.filter('[data-invalid="' + key + '"]').addClass('bi-login-message-show');
        };
        // Remove all messages on user interaction...
        jQuery(scope.form).find('input').add('select').on('focus', function () {
            showMessage(false);
        });

        // Disable/enable form inputs
        // Tip: to bypass the function on a particular field, add the attribute <input data-disable-fields="bypass" /> 
        var disableFields = function (bool) {
            [
                'usernameRemote',
                'usernameLocal',
                'password',
                'passwordNew',
                'passwordNewConfirm',
                'language',
                'mode',
                'submit'
            ].forEach(function (input) {
                var $input = jQuery(scope[input]);
                ('bypass' === $input.attr('data-disable-fields')) || $input.attr('disabled', bool);
            });
        };

        // Mode
        var checkMode = function () {
            return this.factory.get('Ping').all(getUsername()).queue(function (r) {
                showMessage(false);
                var success = true,
                    scopeMode = jQuery(scope.mode).val(),
                    runMode = database.run.mode();
                if ('remote' == runMode && r.remote || 'local' == runMode && r.local) {
                    // Preserve current runMode
                    jQuery(scope.mode).val(runMode);
                } else if (r.remote) {
                    // Switch runMode
                    jQuery(scope.mode).val('remote');
                } else if (r.local) {
                    // Switch runMode
                    jQuery(scope.mode).val('local');
                } else if (!Core.Synchro.hasSynchroTime()) {
                    // No synchronized user available :-(
                    jQuery(scope.mode).val('remote');
                    // Wait for internet connection...
                    setTimeout(checkMode, 5000);
                    showMessage('connection');
                    success = false;
                }
                // Does the "mode" field has changed?
                if (jQuery(scope.mode).val() != scopeMode) {
                    jQuery(scope.mode).trigger('change');
                }
                // Allow form ?
                disableFields(!success);
            });
        }.bind(this);

        // This is first checkMode with some callback initialization...
        var checkModeInit = function () {
            checkMode().queue(function () {
                // Give the focus to the username (Remote or local) or the password...
                // Warning: giving the focus requires that the input is really visible in the window !
                // Thus you should not use .biRouter({ slide: true }) for the main router.
                // Otherwise at the beginning of the "slide" animation the input appears outside of the window,
                // Unfortunately the browser will try to make it visible immediately !
                // This will brake the animation and wil produce a strange behaviour.
                if (lastLogin) {
                    jQuery(scope.password).focus();
                } else if ('remote' == jQuery(scope.mode).val()) {
                    jQuery(scope.usernameRemote).focus();
                } else {
                    jQuery(scope.usernameLocal).focus();
                }
            });
        };

        // Here we go! Proccess AutoLogin or RegularLogin...

        // Is the autologin enabled in the user module and not disabled in the url ?
        disableFields(true);
        if (user.enableAutoLogin && tool.url.parse().hashQueries.auto !== 'no') {
            user.autoLogin(lastLogin).queue(function (success) {
                if (success) {
                    router.redirect('/main');
                } else {
                    // Check connection (if autologin enabled but failed)
                    checkModeInit();
                }
            });
        } else {
            // Check connection (if autologin not enabled)
            checkModeInit();
        }

        // Handle form submit!
        jQuery(scope.form).on('submit', function (e) {
            e.preventDefault();
            disableFields(true);

            var data = {
                username: getUsername(),
                password: jQuery(scope.password).val(),
                language: jQuery(scope.language).val(),
                mode: jQuery(scope.mode).val()
            };

            // Set the run mode before processing the login
            database.run.mode(data.mode);

            // Password not filled!
            if (!data.password) {
                if (!changePassword && user.enableAutoLogin) {
                    // Try autologin!
                    user.autoLogin(data.username).queue(function (success) {
                        if (success) {
                            router.redirect('/main');
                        } else {
                            showMessage('credentials');
                            disableFields(false);
                        }
                    });
                } else {
                    showMessage('credentials');
                    disableFields(false);
                }
                return;
            }

            // Username not filled!
            if (!data.username) {
                showMessage('credentials');
                disableFields(false);
                return;
            }

            // Is new password requested ?
            if (changePassword && database.run.isMode('remote')) {
                data.passwordNew = jQuery(scope.passwordNew).val();
                data.passwordNewConfirm = jQuery(scope.passwordNewConfirm).val();
                if (!data.passwordNew) {
                    showMessage('passwordNew');
                    disableFields(false);
                    return;
                } else if (data.passwordNew !== data.passwordNewConfirm) {
                    showMessage('passwordNewConfirm');
                    disableFields(false);
                    return;
                }
            }

            // Check credentials!
            user.login(data.username, data.password, data.passwordNew).queue(function (result) {
                if (result) {
                    translation.cultureId(data.language);
                    if (changePassword) {
                        var msg = '<i class="fa fa-random"></i> ' + translation.translate('_BI_USER_PASSWORD_CHANGE_SUCCESS');
                        if (Core.Synchro.getSynchroTime()) {
                            // Update the password of the synchronized database
                            Core.Synchro.updateSynchronizedLocalUserPassword(data.passwordNew, function (success) {
                                var msgAlert =
                                    '<i style="color:yellow"><br />The offline password update has failed!' +
                                    '<br />(Required to access your synchronized database)</i>';
                                addNotif({ show: true, content: msg + (success ? '' : msgAlert) });
                            });
                        } else {
                            addNotif({ show: true, content: msg });
                        }
                    }
                    router.redirect('/main');
                } else {
                    checkMode().queue(function (r) {
                        if ('remote' == data.mode && r.remote || 'local' == data.mode && r.local) {
                            showMessage('credentials');
                        } else {
                            showMessage('connection');
                        }
                        disableFields(false);
                    });
                }
            });

        });

    };

})(this, this.jQuery, this.Bi = this.Bi || {});
