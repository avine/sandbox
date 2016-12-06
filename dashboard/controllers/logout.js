
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, Core = Bi.Core; // Alias

    Core.Router.controllers.logout = function (scope, scopeData, scopeBind) {

        var router = this;

        // Clean stored data
        Core.User.cleanAllData();

        // Remove login
        this.factory.get('User').logout().queue(function (result) {

            // Display message about the logout process (from 'remote' or only from 'local')
            jQuery(scope[result.mode]).css('display', 'inline');

            // Display special message
            var $msg = jQuery(scope.message).children(),
            showMessage = function (key) {
                $msg.removeClass('bi-login-message-show');
                if (key) $msg.filter('[data-invalid="' + key + '"]').addClass('bi-login-message-show');
            },
            message = tool.url.parse().hashQueries.message;
            if (message) showMessage(message);
            
            // Precisely if the autologin is enabled, we need to turn this feature off when returning to the login page.
            // Otherwise the logout process will have no effect (since the user will be automatically logged in again)
            var hashQueries = this.enableAutoLogin ? { auto: 'no' } : {};

            // Count down before go to login page
            var count = 3, $count = jQuery(scope.count).text(count), token = setInterval(function () {
                $count.text(--count);
                if (0 == count) {
                    clearInterval(token);
                    // Redirect to the login page with full-reload
                    router.redirect(['/login', hashQueries], false, true);
                }
            }, 1000);
        });

    };

})(this, this.jQuery, this.Bi = this.Bi || {});
