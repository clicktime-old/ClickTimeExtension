// Login controller
myApp.controller("LoginController", ['$scope', 'APIService', '$http', function ($scope, APIService, $http) {
   
    $scope.rerouting = false;
    // Get the session, if it exists, go to popup. Otherwise, stay here.
    chrome.storage.sync.get('session', function(items) {
        if ('session' in items) {
            // Session variable exists
            var session = items.session.data;
            if (session != null) {
                // User does not need to login.
                window.location.href = "../../templates/popup.html";
            }
        }
    })

    $scope.login = function(user) {
        $scope.rerouting = true;
        var sessionURL = API_BASE + "Session";
        // Get the session for the user. If it exists, store it in local storage.
        APIService.apiCall(sessionURL, user.email, user.password, 'GET').then(
             function (session) {
                chrome.storage.sync.set(
                    {'session' : session},
                    function() {
                        console.log("Set session in local storage.");
                        window.location.href = "../../templates/popup.html";
                    }
                )
            },
            function (error) {
                $scope.loginError = true;
            }
        )
    }
}])

