// Service for requesting the session of a user. Requires user to be logged in.

myApp.service('SessionService', function($http) {
    
    this.getSession = function (email, password, callback) {
        var sessionURL = API_BASE + "Session";
        var credentials = btoa(email + ":" + password);
        var request = {
            method: 'GET',
            url: sessionURL,
            headers: {
                'Authorization' : 'Basic ' + credentials
            }
           
        };
        $http(request)
        .success(function(data, status, headers, config) {
            callback(data);
        }).
        error(function(data, status, headers, config) {
            callback(null); 
        });
    }
})



