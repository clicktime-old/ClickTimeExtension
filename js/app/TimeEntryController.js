myApp.controller("TimeEntryController", ['$scope', '$q', '$interval', '$timeout', '$location', 'APIService', 'CTService', 'EntityService', 'TimeEntryService', 'StopwatchService', '$http', 
                                function ($scope, $q, $interval, $timeout, $location, APIService, CTService, EntityService, TimeEntryService, StopwatchService, $http) {
    
    //Company custom terms
    $scope.customTerms = {};

    // All tasks for a company. Used to filter by permitted Task ID.
    $scope.allTasks = [];

    // True iff saving is in progress
    $scope.saving = false;

    // Client, job, or task is empty in db
    $scope.HasEmptyEntities = false;

    // True if a stopwatch is running
    $scope.runningStopwatch = false;
    // True if a stopwatch has expired from yesterday or before
    $scope.abandonedStopwatch = false;
    // True if a time entry has expired from yesterday or before
    $scope.abandonedEntry = false;
    // Whether to show pop out icon
    $scope.showPopupArrow = chrome.extension.getBackgroundPage().showPopupArrow;
  
    // Link to the settings page
    $scope.settingsPage = function () {
        $location.path("/settings");
    }

    // opens popup
    $scope.openPopup = function() {
        chrome.extension.getBackgroundPage().createWindow();
    }

    // Function to test sending an error to API
    $scope.testError = function() {
        APIService.reportError($scope.Session.UserEmail,
            $scope.Session.Token,
            {'Message' : 'Hey there I am an error',
                'DeviceName' : 'Chrome Ext',
                'DevicePlatform': 'GOogle chrome'
            });
    }
    

    /////////////////////////////////////////////////////////////////////////

    /* Listen for update from the following things:
        - from an integration
        - from popup arrow broadcasting
        - forced page refresh
    */ 
    chrome.runtime.onMessage.addListener(
        function (request, sender, sendResponse) {

            if (request.updateIntegration) {
                console.log("Got request to update intgegration")
                $scope.timeEntry.ISOStartTime = new Date(JSON.parse(request.startTime));
                $scope.timeEntry.ISOEndTime = new Date(JSON.parse(request.endTime));
                $scope.showStartTimer = false;
                $scope.$apply();
            }

            if (request.showPopupArrow == false) {
                $scope.showPopupArrow = false;
                $scope.$apply();
            }

            if (request.refresh) {
                $scope.$apply();
            }
        }     
    )

    /////////////////////////////////////////// Interface logic /////////////////////////////////////

    // start stopwatch, if there
    $(document).keypress(function(e) {
        if (e.which == 13) {
            if ($scope.showStartTimer && !$scope.runningStopwatch) {
                $("#start-stopwatch").click();
            } else if ($scope.runningStopwatch) {
                $scope.stopStopwatch();
            }
        }
    })

    // Send a notification immediately for demonstration purposes
    $scope.sendNotification = function () {
        chrome.extension.getBackgroundPage().sendOneNotification();
    }

    // Save time entry if focused on hours and enter
    $("#time-entry-form-hours").keypress(function(e) {
        if (e.which == 13) {
            $("#time-entry-form-hours").blur();
            $("#save-time-entry").click();
        }
    })

    // Save time entry if focused on start/end and enter
    $("#time-entry-form-start").keypress(function(e) {
        if (e.which == 13) {
            $("#time-entry-form-start").blur();
            $("#time-entry-form-end").blur();
            $("#save-time-entry").click();
        }
    })

    // Save time entry if focused on start/end and enter
    $("#time-entry-form-end").keypress(function(e) {
        if (e.which == 13) {
            $("#time-entry-form-start").blur();
            $("#time-entry-form-end").blur();
            $("#save-time-entry").click();
        }
    })


    // Update in progress entry notes on blur
    $scope.updateNotes = function() {
        if ($scope.timeEntry.Comment && $scope.timeEntry.Comment != "") {
            $scope.clearError("notes");
            TimeEntryService.updateInProgressEntry("Comment", $scope.timeEntry.Comment);
        }
        
    }

    // Focus on notes and clear errors
    $scope.focusNotes = function() {
        $scope.clearError("notes");
        if ($scope.showHourEntryField && !$scope.timeEntry.Hours) {
            $scope.showStartTimer = true;
        } else if ($scope.showStartEndTimes && (!$scope.timeEntry.ISOStartTime 
            && !$scope.timeEntry.ISOEndTime)) {
            $scope.showStartTimer = true;
        } 
        else {
            clearSuccessMessage();
            $scope.showStartTimer = false;
        }
    }

    // Swap action button from start timer to save and vice versa.
    // input is a string representing from what input field the action
    // was called from.
    $scope.swapAction = function(input) {
        if ($scope.generalError) {
            // cannot swap action with an active error
            $scope.clearError(input);
            return;
        }
        if ($scope.showHourEntryField && $scope.timeEntry.Hours) {
            // Cannot swap action if user has entered hours
            return;
        }
        if ($scope.showStartEndTimes) {
            if ($scope.showStartTimer) {
                clearSuccessMessage();
                $scope.showStartTimer = false;
                return;
            }
            return;
        }
        if ($scope.showStartTimer) {
            clearSuccessMessage();
            $scope.showStartTimer = false;
        } else {
            $scope.showStartTimer = true;
        }
    }
    
     
    // For the stopwatch display on start/end times:
    $scope.endTimePromise = undefined;

    // Start a stopwtach and the end time promise
    $scope.startStopwatch = function () {
        clearSuccessMessage();
        $scope.showStartTimer = false;
        if ($scope.showHourEntryField) {
            $scope.$broadcast("startStopwatch");
        } else {
            $scope.noValidateStartEndTimes = true;
            $scope.$broadcast("startStopwatch");
            var now = new Date();
            var start = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                now.getHours(), now.getMinutes(), 0);
            $scope.timeEntry.ISOStartTime = start;
            $scope.timeEntry.ISOEndTime = start;
            TimeEntryService.updateInProgressEntry('startEndTimes',
                    [$scope.timeEntry.ISOStartTime, $scope.timeEntry.ISOEndTime]);
            $scope.endTimePromise = $interval(function() {
                var now = new Date();
                var end = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                    now.getHours(), now.getMinutes(), 0);
                $scope.timeEntry.ISOEndTime = end;
                TimeEntryService.updateInProgressEntry('startEndTimes',
                    [$scope.timeEntry.ISOStartTime, $scope.timeEntry.ISOEndTime]);
            }, 60000);
        }
       
    }

    // Clear the successful save message
    var clearSuccessMessage = function() {
        if ($scope.generalSuccess == true) {
            $scope.generalSuccess = false;
            $scope.$apply();
        }

    }

    // Stop a stopwatch and end a timer promise
    $scope.stopStopwatch = function() {
        $scope.saveFromTimer = true;
        $scope.$broadcast("stopStopwatch");
        $scope.showStartTimer = true;
        $scope.noValidateStartEndTimes = true;
        $scope.saveTimeEntry($scope.Session, $scope.timeEntry);
    }

    // Clear an in progress stopwatch
    $scope.clearStopwatch = function() {
        $scope.$broadcast("clearStopwatch");
        $scope.timerDisplay = "00:00:00";
        $interval.cancel($scope.endTimePromise);
    }

    // Save an abandoned stopwatch
    $scope.saveAbandonedStopwatch = function() {
        $scope.saveTimeEntry($scope.Session, $scope.timeEntry);
    }


    // Display fields for running stopwatch
    $scope.elapsedHrs = 0;
    $scope.elapsedMin = 0;
    $scope.elapsedSec = 0;

    $scope.$on("updateStopwatch", function() {
        $scope.timerDisplay = $scope.elapsedHrs + ":" + $scope.elapsedMin + ":" + $scope.elapsedSec;    
    })


    // Clear in progress entry hours
    $scope.clearHours = function() {
        $scope.timeEntry.Hours = DEFAULT_EMPTY_HOURS;
        $scope.showStartTimer = true;
        $scope.clearAllErrors();
        TimeEntryService.removeInProgressEntry();
    }


    // Validate and round hour input field on blur.
    $scope.roundHour = function (time, timeToIncrement) {
        $scope.generalError = false;
        if (time == null || time == "") {
            $scope.showStartTimer = true;
            return;
        }
        if (!CTService.isNumeric(time)) {
            $scope.setError("hours", "Please enter time using a valid format.");
            return;
        }
        if (time) {
            var decimalHrs = time;
            if ((decimalHrs + '').indexOf(":") != -1) {
                // HH:MM format
                decimalHrs = CTService.toDecimal(time);   
            }

            var roundedDecHrs = CTService.roundToNearestDecimal(decimalHrs, timeToIncrement);

            if (roundedDecHrs == 0) {
                $scope.setError("hours", "Oops! Please log some time in order to save this entry.");
                return;
            }
            if (roundedDecHrs > 24) {
                $scope.setError("hours", "Please make sure your daily hourly total is less than 24 hours.");
                return; 
            }
           
            var hrs = CTService.roundToNearest(time, timeToIncrement);
            $scope.timeEntry.Hours = hrs;
            $scope.showStartTimer = false;
            TimeEntryService.updateInProgressEntry('Hours', $scope.timeEntry.Hours, function () {
                TimeEntryService.updateInProgressEntry('inProgress', true);
            });
        }
        
    }

    // Validate start end times on blur.
    $scope.validateStartEndTimes = function(startTime, endTime) {
        if ($scope.showStartEndTimes) {
            if ($scope.noValidateStartEndTimes) {
                // don't validate if saving from timer
                return;
            }
            if (!startTime && !endTime) {
                $scope.showStartTimer = true;
                return;
            }
            else if (!startTime) {
                TimeEntryService.updateInProgressEntry('ISOEndTime', endTime);
            }
            else if (!endTime) {
                TimeEntryService.updateInProgressEntry('ISOStartTime', startTime);
            }
            else {
                var hourDiff = CTService.difference(endTime, startTime, $scope.company.MinTimeIncrement);
                if (hourDiff <= 0) {
                     $scope.setError("startEndTimes", "Oops! Please enter a start time later than the end time.");
                     return;
                }
                if (hourDiff > 24) {
                    $scope.setError("startEndTimes", "Please make sure your daily hourly total is less than 24 hours.");
                } else {
                    $scope.clearError('startEndTimes');
                    clearSuccessMessage();
                    $scope.showStartTimer = false;
                    TimeEntryService.updateInProgressEntry('startEndTimes', [startTime, endTime]);
                }
            }
        }
        
    }

    // Clear in progress start end times
    $scope.clearStartEndTimes = function() {
        $scope.timeEntry.ISOStartTime = null;
        $scope.timeEntry.ISOEndTime = null;
        $scope.showStartTimer = true;
        $scope.clearAllErrors();
        TimeEntryService.removeInProgressEntry();
    }


    // Clear all template errors
    $scope.clearAllErrors = function () {
        $scope.generalError = false;
        $scope.clearError("hours");
        $scope.clearError("notes");
        $scope.clearError("startTime");
        $scope.clearError("endTime");
        $scope.clearError("startEndTimes");
        $scope.clearError("jobClient");
        $scope.clearError("task");
    }

    // Clear a specific error by errorfield
    $scope.clearError = function (errorField) {
        $scope.generalError = false;
        switch (errorField) {
            case "hours":
                $("#time-entry-form-hours").css("border", "1px solid #bcbcbc");
                $("#time-entry-field-hours-title").css("color", "black");
                break;
            case "notes":
                $("#notes-field").css("border", "1px solid #bcbcbc");
                $("#fieldtitle-notes").css("color", "black");
                break;
            case "startTime":
                $("#time-entry-form-start").css("border", "1px solid #bcbcbc");
                $("#time-entry-form-start-title").css("color", "black");
                break;
            case "endTime":
                $("#time-entry-form-end").css("border", "1px solid #bcbcbc");
                $("#time-entry-form-end-title").css("color", "black");
                break;
            case "startEndTimes":
                $("#time-entry-form-start").css("border", "1px solid #bcbcbc");
                $("#time-entry-form-end").css("border", "1px solid #bcbcbc");
                $("#time-entry-form-end-title").css("color", "black");
                $("#time-entry-form-start-title").css("color", "black");
                break;
            case "jobClient":
                $("#jobClient-dropdown > a.dropdown-toggle").css("border", "1px solid #bcbcbc");
                $("#fieldtitle-jobclient").css("color", "black");
                break;
            case "task":
                $("#task-dropdown > a.dropdown-toggle").css("border", "1px solid #bcbcbc");
                $("#fieldtitle-task").css("color", "black");
                break;
            default:
                break;
        }
    }

    // Display an error message and highlight the specified field in red.
    $scope.setError = function (errorField, errorMessage) {
        $scope.errorMessage = errorMessage;
        $scope.generalError = true;
        switch (errorField) {
            case "hours":
                $("#time-entry-form-hours").css("border", "1px solid red");
                $("#time-entry-field-hours-title").css("color", "red");
                break;
            case "notes":
                $("#notes-field").css("border", "1px solid red");
                $("#fieldtitle-notes").css("color", "red");
                break;
            case "startTime":
                $("#time-entry-form-start").css("border", "1px solid red");
                $("#time-entry-form-start-title").css("color", "red");
                break;
            case "endTime":
                $("#time-entry-form-end").css("border", "1px solid red");
                $("#time-entry-form-end-title").css("color", "red");
                break;
            case "startEndTimes":
                $("#time-entry-form-start").css("border", "1px solid red");
                $("#time-entry-form-end").css("border", "1px solid red");
                $("#time-entry-form-start-title").css("color", "red");
                $("#time-entry-form-end-title").css("color", "red");
                break;
            case "jobClient":
                $("#jobClient-dropdown > a.dropdown-toggle").css("border", "1px solid red");
                $("#fieldtitle-jobclient").css("color", "red");
                break;
            case "task":
                $("#task-dropdown > a.dropdown-toggle").css("border", "1px solid red");
                $("#fieldtitle-task").css("color", "red");
                break;
            case "jobConflict":
                $scope.setError('jobClient', errorMessage);
                break;
            case "clientConflict":
                $scope.setError('jobClient', errorMessage);
                break;
            case "taskConflict":
                $scope.setError('task', errorMessage);
                break;
            default:
                break;
        }
    }  

    // If there's been an error on saving a time entry, stop the stopwatch
    $scope.$on("timeEntryError", function() {
        $scope.saving = false;
        $scope.clearStopwatch();
    })

    // Actions to take upon successful time entry save
    $scope.$on("timeEntrySuccess", function() {
        $scope.timeEntry.Hours = DEFAULT_EMPTY_HOURS;
        $scope.timeEntry.Comment = "";
        $scope.$broadcast("clearStopwatch");
        $scope.timeEntry.ISOStartTime = null;
        $scope.timeEntry.ISOEndTime = null;
        $scope.clearAllErrors();
        $scope.saveFromTimer = false;
        $scope.showStartTimer = true;
        $scope.saving = false;
        $scope.abandonedStopwatch = false;
        $scope.abandonedEntry = false;
        $scope.pageReady = true;
    })


    // Clear an in progress entry and remove display fields
    $scope.clearTimeEntry = function() {
        $scope.abandonedEntry = false;
        if ($scope.showStartEndTimes) {
            $scope.clearStartEndTimes();
        } else if ($scope.showHourEntryField) {
            $scope.clearHours();
        }
        $scope.clearStopwatch();
    }
    
    //////////////////////////////////////////////////////////////////

    ////// Time entry ////// 

    // Time entry methods
    $scope.timeEntryMethods = ['duration', 'start-end'];
    $scope.timeEntryMethod = $scope.timeEntryMethods[0];

    // Change the template time entry method
    $scope.changeTimeEntryMethod = function (timeEntryMethod) {
      $scope.timeEntryMethod = timeEntryMethod;
    	switch (timeEntryMethod) {
    		case "duration":
    			$scope.showHourEntryField = true;
    			$scope.showStopwatch = false;
    			$scope.showStartEndTimes = false;
                $('#notes-field').css({'width': '390px', 'max-width': '390px'});
    			break;
    		case "start-end":
    			$scope.showHourEntryField = false;
    			$scope.showStartEndTimes = true;
    			$scope.showStopwatch = false;
                $('#notes-field').css({'width': '248px', 'max-width': '248px', 'margin-right' : '0px'});
    			break;
    		default:
    			bootbox.alert("Invalid time entry method");
    			break;
    	}
    }

    // Clear successful message upon clicking anywhere on the extension
    $('#main').on('click', function() {
        if ($scope.generalSuccess == true) {
            $scope.generalSuccess = false;
            $scope.$apply();
        } 
    })

    // SUPER AWESOME FUNCTION!! Save a time entry
    /** First, refresh all entity lists. (see below) Then, validate the entry.
      * If successful, broadcast a success. If failed, show an error. */
    $scope.saveTimeEntry = function (session, timeEntry) {
        $scope.saving = true;
        $scope.clearAllErrors();
        $scope.refresh().then(function() {
            var clickTimeEntry = {
                "BreakTime" : timeEntry.BreakTime,
                "Comment" : timeEntry.Comment,
                "Date" : timeEntry.Date,
                "JobID" : timeEntry.JobID,
                "PhaseID" : timeEntry.PhaseID,
                "SubPhaseID" : timeEntry.SubPhaseID,
                "TaskID" : timeEntry.TaskID,
                "job" : timeEntry.job,
                "task" : timeEntry.task,
                "client" : timeEntry.client
            }
            if ($scope.showHourEntryField && !$scope.saveFromTimer && !$scope.abandonedStopwatch) {
                if (!timeEntry.Hours) {
                    $scope.setError("hours", "Oops! Please log some time in order to save this entry.");
                    return;
                }
                clickTimeEntry.Hours = CTService.toDecimal(timeEntry.Hours);
            }

            if (!$scope.saveFromTimer && $scope.showStartEndTimes || $scope.abandonedStopwatch) {
                if (!timeEntry.ISOStartTime && !timeEntry.ISOEndTime) {
                    $scope.setError("startEndTimes", "Oops! Please enter a start and end time to save this entry.");
                    return;
                }
                if (!timeEntry.ISOStartTime) {
                    $scope.setError("startTime", "Oops! Please enter a start time to save this entry.");
                    return;
                }
                if (!timeEntry.ISOEndTime) {
                    $scope.setError("endTime", "Oops! Please enter an end time to save this entry.");
                    return;
                }
                var hourDiff = CTService.difference(timeEntry.ISOEndTime, timeEntry.ISOStartTime, $scope.company.MinTimeIncrement);
                clickTimeEntry.Hours = hourDiff;
                timeEntry.Hours = hourDiff;
                var ISOEndTime = CTService.convertISO(timeEntry.ISOEndTime);
                var ISOStartTime = CTService.convertISO(timeEntry.ISOStartTime);
                clickTimeEntry.ISOStartTime = ISOStartTime;
                clickTimeEntry.ISOEndTime = ISOEndTime;
            }

            if ($scope.saveFromTimer || $scope.showStopwatch && !$scope.abandonedStopwatch) {
                var hrs = $scope.elapsedHrs;
                var min = $scope.elapsedMin;
                var sec = $scope.elapsedSec;
                var compiledHours = CTService.compileHours(hrs, min, sec, $scope.company.MinTimeIncrement);
                clickTimeEntry.Hours = CTService.toDecimal(compiledHours);
                timeEntry.Hours = compiledHours;
            }

            if ($scope.user.RequireStopwatch) {
                var ISOEndTime = CTService.convertISO(timeEntry.ISOEndTime);
                var ISOStartTime = CTService.convertISO(timeEntry.ISOStartTime);
                if (ISOStartTime == ISOEndTime) {
                    var endSplit = ISOEndTime.split(":");
                    ISOEndTime = endSplit[0] + ":" + (parseInt(endSplit[1]) + 1) + ":" + endSplit[2];
                }
                clickTimeEntry.ISOStartTime = ISOStartTime;
                clickTimeEntry.ISOEndTime = ISOEndTime;
            }



            if (!validateTimeEntry(timeEntry)) {
                console.log(timeEntry);
                $scope.$broadcast("timeEntryError");
                return;
            } else {
                $scope.pageReady = false;
                TimeEntryService.saveTimeEntry(session, clickTimeEntry)
                .then(function (response) {
                    var d = new Date();
                    TimeEntryService.removeInProgressEntry();
                    var successMessageTotalRaw = CTService.roundToNearestDecimal(clickTimeEntry.Hours, $scope.company.MinTimeIncrement);
                    var successHoursAsTimeClock = CTService.toHours(successMessageTotalRaw);
                    var successMessageHrsMinsFormatted = CTService.getSuccessTotalFormatted(successHoursAsTimeClock);

                    $scope.successMessage = successMessageHrsMinsFormatted + " saved!";

                    //ALEX JONES

                    // $scope.successMessage = "Entry successfully uploaded at " + d.toTimeString() + ".";
                    $scope.generalSuccess = true;
                    $scope.$broadcast("timeEntrySuccess");
                    EntityService.updateRecentEntities(timeEntry);
                    EntityService.getTimeEntries($scope.Session, function (timeEntries) {
                        var totalHours = 0;
                        var timeEntries = timeEntries[0].TimeEntries;
                        var arrayLength = timeEntries.length;
                        for (var i = 0; i < arrayLength; i++) {
                            totalHours += timeEntries[i].Hours;
                        }
                        var splitHrs = (totalHours + '').split(".");
                        var hrs = parseInt(splitHrs[0]);
                        var min = null;
                        if (splitHrs.length == 2) {
                            var min = parseFloat('0.' + splitHrs[1]);
                            min = Math.floor(min * 60);
                        }
                        $scope.totalHoursLogMessage = CTService.getLogMessage(hrs, min);
                        
                        //ALEX JONES
                        $scope.zeroHoursEncouragementMessage = CTService.getZeroHoursMessage(hrs, min);
                        //ALEX JONES
                    });
                })
                .catch(function (response) {
                    if (response.data == null) {
                        var d = new Date();
                        $scope.$broadcast("timeEntryError");
                        TimeEntryService.removeInProgressEntry();
                        TimeEntryService.storeTimeEntry(clickTimeEntry, function() {
                            $scope.setError(null, 'Currently unable to upload entry. Entry saved locally at ' + 
                            d.toTimeString() + '. Your entry will be uploaded once a connection can be established');
                        })
                    } else {
                        $scope.setError(null, "There has been an unknown error. Please contact customer support at support@clicktime.com.");
                        if (!$scope.abandonedStopwatch) {
                            $scope.$broadcast("timeEntryError");
                        }
                    }
                    $scope.pageReady = true;
                });
            }  
        })
    }
    
    // True iff time entry is valid. Will also throw red error messages.
    var validateTimeEntry = function (timeEntry) {

        if ($scope.generalError) {
            return false;
        }
        if (timeEntry.JobID == undefined || timeEntry.TaskID == undefined) {
            $scope.setError("jobClient", "Job or task cannot be empty.");
            return false;
        }

        if (timeEntry.JobID == "" || timeEntry.TaskID == "") {
            $scope.setError("jobClient", "Job or task cannot be empty.");
            return false;
        }

        if ($scope.user.RequireComments && (timeEntry.Comment == undefined || 
            timeEntry.Comment == "")) {
            $scope.setError("notes", "Oops! Please enter some notes in order to save this entry.");
            return;
        }

        
        if (!$scope.noValidateStartEndTimes && $scope.showStartEndTimes || $scope.abandonedStopwatch) {
            if (!timeEntry.ISOStartTime) {
                $scope.setError("startTime", "Oops! Please enter a start time to save this entry.");
                return false;
            }
            if (!timeEntry.ISOEndTime) {
                $scope.setError("endTime", "Oops! Please enter an end time to save this entry.");
                return false;
            }
            var hourDiff = CTService.difference(timeEntry.ISOEndTime, timeEntry.ISOStartTime, $scope.company.MinTimeIncrement);
            if (hourDiff <=0 ) {
                $scope.setError("startEndTimes",  "Please enter an end time later than your start time.");
                return false;
            } else if (hourDiff > 24) {
                $scope.setError("startEndTimes",  "Please make sure your daily hourly total is less than 24 hours.");
                return false;
            } else if (!timeEntry.Hours) {
                $scope.setError("hours", "Oops! Please log some time in order to save this entry.");
                return false;
            }
        }

        if ($scope.showHourEntryField || $scope.showStopwatch && !$scope.abandonedStopwatch
            && !$scope.saveFromTimer) {
            if (timeEntry.Hours == DEFAULT_EMPTY_HOURS || timeEntry.Hours == 0) {
                $scope.setError("hours", "Oops! Please log some time in order to save this entry.");
                return false;
            }
            if (timeEntry.Hours > 24.00) {
                $scope.setError("hours", "Please make sure your daily hourly total is less than 24 hours.");
                return false;
            }

            else if (timeEntry.Hours < 0) {
                $scope.setError("hours", "Please make sure your time entry is greater than 0.");
                return false;
            }

            else if (!CTService.isNumeric(timeEntry.Hours)) {
                $scope.setError("hours", "Please enter time using a valid format.");
                return false;
            }
        }

        return true;
    }

    // Cancel an abandoned stopwatch
    $scope.cancelAbandonedStopwatch = function() {
        $scope.$broadcast("clearStopwatch");
        $scope.clearTimeEntry();
        TimeEntryService.removeInProgressEntry();
        $scope.abandonedStopwatch = false;
    }

    // Add an entity to the scope's time entry. Called with every selection of a dropdown.
    $scope.addEntityTimeEntry = function (entityType, entity) {
        switch (entityType) {
            case "task":
                $scope.timeEntry.task = entity;
                $scope.timeEntry.TaskID = entity.TaskID;
                TimeEntryService.updateInProgressEntry("task", $scope.timeEntry.task);
                break;
            case "jobClient":
                $scope.timeEntry.job = entity.job;
                $scope.timeEntry.JobID = entity.job.JobID;
                $scope.timeEntry.client = entity.client;
                TimeEntryService.updateInProgressEntry("client", $scope.timeEntry.client, function() {
                    TimeEntryService.updateInProgressEntry("job", $scope.timeEntry.job)
                })
                break;
            default:
                bootbox.alert("Improper entity of type: " + entityType);
                break;
        }
    }

    ////////////////////////////

    // Logout function - will remove local and sync storage variables.
    $scope.logout = function() {
        chrome.storage.sync.get('stopwatch', function (items) {
            if ('stopwatch' in items && items.stopwatch.running) {
                bootbox.confirm("Warning! If you logout, your timer will be erased. Are you sure you want to logout?", function (result) {
                    if (!result) {
                        return;
                    }
                })
            }
            $location.path("/login");
            $scope.removeLocalStorageVars();
            $scope.removeSyncStorageVars();
            chrome.extension.getBackgroundPage().stopNotifications(); // stop generation of new notifications
            $scope.$apply();
        })
    }

    // Remove local storage variables from chrome
    $scope.removeLocalStorageVars = function() {
        chrome.storage.local.remove(CHROME_LOCAL_STORAGE_VARS, function () {
            chrome.browserAction.setBadgeText({text:""});
        })
    }

    // Rmove sync storage variables from chrome
    $scope.removeSyncStorageVars = function() {
        chrome.storage.sync.remove(CHROME_SYNC_STORAGE_VARS);
    }




    // Check for update to jobClient and reset permitted task list.
    $scope.$watch('jobClient', function (newJobClient) {
        if (newJobClient && $scope.company && $scope.company.TaskRestrictionMethod == "byjob") {
            var tasksList = $scope.allTasks;
            var permittedTaskIDs = newJobClient.job.PermittedTasks.split(",");
            var permittedTasks = [];
            for (i in tasksList) {
                var t = tasksList[i];
                if (EntityService.hasTaskID(permittedTaskIDs, t.TaskID)) {
                    permittedTasks.push(t);
                }
            }
            if (permittedTasks.length > 0) {
                $scope.task = permittedTasks[0];
            } else {
                $scope.task = undefined;
            }
            $scope.tasks = permittedTasks;
            if ($scope.task) {
                $scope.timeEntry.task = $scope.task;
                $scope.timeEntry.TaskID = $scope.task.TaskID;    
            }
            TimeEntryService.updateInProgressEntry('task', $scope.task);
        }
    })

    // If populated with 4 entites, then scope is done refreshing:
    $scope.doneRefresh = [];

    // Refresh function
    /** Force an update to all entity lists from the API. Do not check local storage first.
        This method also deals with conflicts -- for example, if you try to save a time entry
        with a job that no longer exists in Clicktime, this will set an error. */
    $scope.refresh = function() {
        var deferred = $q.defer();
        if ($location.url() == '/settings') {
            $scope.$emit("refresh");
        }
        
        $scope.HasEmptyEntities = false;

        $scope.clearAllErrors();
        $scope.$parent.$broadcast("pageLoading");
        if (!$scope.saving) {
            TimeEntryService.removeInProgressEntry();
        }
       

        $scope.removeLocalStorageVars();

        var afterGetJobClients = function (jobClientsList) {

            var currentJobClient = {
                'job' : $scope.timeEntry.job,
                'client' : $scope.timeEntry.client,
                'DisplayName' :  $scope.timeEntry.client.DisplayName + " - " 
                                + $scope.timeEntry.job.DisplayName 
            }
            if (!EntityService.hasJobClient(jobClientsList, currentJobClient)) {
                $scope.setError("jobClientConflict", "We're sorry but the "
                            + $scope.customTerms.clientTermSingLow + "/"
                            + $scope.customTerms.jobTermSingLow + " "
                            + currentJobClient.DisplayName + " you've chosen is no longer available. "
                            + "Please choose a different "
                            + $scope.customTerms.clientTermSingLow + "/"
                            + $scope.customTerms.jobTermSingLow
                            + " or contact your company's ClickTime administrator for more details.");
                $scope.jobClients = jobClientsList;
                $scope.jobClient = jobClientsList[0];
                if ($scope.jobClient) {
                    $scope.timeEntry.job = $scope.jobClient.job;
                    $scope.timeEntry.JobID = $scope.jobClient.job.JobID;
                    $scope.timeEntry.client = $scope.jobClient.client;
                }
                TimeEntryService.updateInProgressEntry("job", $scope.timeEntry.job, function() {
                    TimeEntryService.updateInProgressEntry("client", $scope.timeEntry.client);
                })
            } else {
                $scope.jobClients = jobClientsList;
                var index = EntityService.indexJobClient(jobClientsList, currentJobClient);
                $scope.jobClient = jobClientsList[index];
                var currentJob = $scope.jobClient.job;
                var currentTask = $scope.task;
                if (currentTask && $scope.company && $scope.company.TaskRestrictionMethod == "byjob") {
                    var permittedTaskIDs = currentJob.PermittedTasks.split(",");
                    if (!EntityService.hasTaskID(permittedTaskIDs, currentTask.TaskID)) {
                        $scope.setError("taskConflict", "We're sorry but the "
                                + $scope.customTerms.taskTermSingLow + " "
                                + currentTask.DisplayName + " you've chosen is no longer available. "
                                + "Please choose a different "
                                + $scope.customTerms.taskTermSingLow
                                + " or contact your company's ClickTime administrator for more details.");
                    }
                }
            }

            if (jobClientsList.length == 0) {
                $scope.HasEmptyEntities = true;
            }

            $scope.doneRefresh.push("jobClients");
            if ($scope.doneRefresh.length >= 4) {
                deferred.resolve();
            }
            $scope.$apply();

        }

        var afterGetTasks = function (tasksList) {
            var currentTask = $scope.timeEntry.task;
            if (currentTask) {
                if (!EntityService.hasTask(tasksList, currentTask)) {
                    $scope.setError("taskConflict", "We're sorry but the "
                                + $scope.customTerms.taskTermSingLow + " "
                                + currentTask.DisplayName + " you've chosen is no longer available. "
                                + "Please choose a different "
                                + $scope.customTerms.taskTermSingLow
                                + " or contact your company's ClickTime administrator for more details.");
                    $scope.allTasks = tasksList;
                    if ($scope.jobClient && $scope.company && $scope.company.TaskRestrictionMethod == "byjob") {
                        var permittedTaskIDs = $scope.jobClient.job.PermittedTasks.split(",");
                        var permittedTasks = [];
                        for (i in tasksList) {
                            var t = tasksList[i];
                            if (EntityService.hasTaskID(permittedTaskIDs, t.TaskID)) {
                                permittedTasks.push(t);
                            }
                        }
                        $scope.tasks = permittedTasks;
                    } else {
                        $scope.tasks = tasksList;    
                    }
                    if ($scope.tasks.length > 0) {
                        $scope.task = $scope.tasks[0];
                    }
                    if ($scope.task) {
                        $scope.timeEntry.task = $scope.task;
                        $scope.timeEntry.TaskID = $scope.task.TaskID;
                    }
                    TimeEntryService.updateInProgressEntry('task', $scope.timeEntry.task);
                    $scope.doneRefresh.push("tasks");
                    if ($scope.doneRefresh.length >= 4) {
                        deferred.resolve();
                    }
                    $scope.$apply();
                } else {
                    var currentJob = $scope.timeEntry.job;
                    if ($scope.company && $scope.company.TaskRestrictionMethod == "byjob") {
                        var permittedTaskIDs = currentJob.PermittedTasks.split(",");
                        if (!EntityService.hasTaskID(permittedTaskIDs, currentTask.TaskID)) {
                            $scope.setError("taskConflict", "We're sorry but the "
                                    + $scope.customTerms.taskTermSingLow + " "
                                    + currentTask.DisplayName + " you've chosen is no longer available. "
                                    + "Please choose a different "
                                    + $scope.customTerms.taskTermSingLow
                                    + " or contact your company's ClickTime administrator for more details.");
                            $scope.allTasks = tasksList;
                            if ($scope.jobClient) {
                                var permittedTaskIDs = $scope.jobClient.job.PermittedTasks.split(",");
                                var permittedTasks = [];
                                for (i in tasksList) {
                                    var t = tasksList[i];
                                    if (EntityService.hasTaskID(permittedTaskIDs, t.TaskID)) {
                                        permittedTasks.push(t);
                                    }
                                }
                                $scope.tasks = permittedTasks;
                            } else {
                                $scope.tasks = tasksList;    
                            }
                            if ($scope.tasks.length > 0) {
                                $scope.task = $scope.tasks[0];
                            }
                            if ($scope.task) {
                                $scope.timeEntry.task = $scope.task;
                                $scope.timeEntry.TaskID = $scope.task.TaskID;
                            }
                            TimeEntryService.updateInProgressEntry('task', $scope.timeEntry.task);
                            $scope.doneRefresh.push("tasks");
                            if ($scope.doneRefresh.length >= 4) {
                                deferred.resolve();
                            }
                            $scope.$apply();
                        } else {
                            $scope.allTasks = tasksList;
                            if ($scope.jobClient) {
                                var permittedTaskIDs = $scope.jobClient.job.PermittedTasks.split(",");
                                var permittedTasks = [];
                                for (i in tasksList) {
                                    var t = tasksList[i];
                                    if (EntityService.hasTaskID(permittedTaskIDs, t.TaskID)) {
                                        permittedTasks.push(t);
                                    }
                                }
                                $scope.tasks = permittedTasks;
                            } else {
                                $scope.tasks = tasksList;    
                            }
                            if ($scope.tasks.length > 0) {
                                $scope.task = $scope.tasks[0];
                            }
                            if ($scope.task) {
                                $scope.timeEntry.task = $scope.task;
                                $scope.timeEntry.TaskID = $scope.task.TaskID;
                            }
                            TimeEntryService.updateInProgressEntry('task', $scope.timeEntry.task);
                            $scope.doneRefresh.push("tasks");
                            if ($scope.doneRefresh.length >= 4) {
                                deferred.resolve();
                            }
                            $scope.$apply();
                        }
                    }
                    

                }
            }
            
        }

        var afterGetUser = function (user) {
            var currentUser = $scope.user;
            if (currentUser.RequireStartEndTime != user.RequireStartEndTime) {
                $scope.setError("userConflict", "We're sorry but the "
                            + "entry method" + " "
                            + " you've chosen is no longer available. "
                            + "Please choose a different "
                            + "entry method in the settings"
                            + " or contact your company's ClickTime administrator for more details.");
                if (user.RequireStartEndTime) {
                  $scope.changeTimeEntryMethod("start-end");
                  chrome.storage.sync.set({
                    'timeEntryMethod' : {
                      UserID: user.UserID,
                      method: 'start-end'
                    }
                  })
                } else {
                  $scope.changeTimeEntryMethod("duration");
                  chrome.storage.sync.set({ 
                    'timeEntryMethod' : {
                      UserID: user.UserID,
                      method: 'duration'
                    }
                  })
                }
              $scope.$apply();
              return;
            }
            $scope.user = user;
            $scope.doneRefresh.push("user");

            if ($scope.doneRefresh.length >= 4) {
                deferred.resolve();
            }
            $scope.$apply();
        }

        var afterGetCompany = function (company) {
            $scope.company = company;
            if (company.DCAALoggingEnabled || company.HasModuleSubJob) {
                $scope.$parent.DCAASubJobError = true;
                $scope.logout();
            }
            $scope.customTerms = {
                'clientTermSingLow' : company.ClientTermSingular,
                'clientTermPlurLow' : company.ClientTermPlural,
                'clientTermSingHigh' : company.ClientTermSingular.capitalize(),
                'clientTermPlurHigh' : company.ClientTermPlural.capitalize(),
                'jobTermSingLow' : company.JobTermSingular,
                'jobTermPlurLow' : company.JobTermPlural,
                'jobTermSingHigh' : company.JobTermSingular.capitalize(),
                'jobTermPlurHigh' : company.JobTermPlural.capitalize(),
                'taskTermSingLow' : company.TaskTermSingular,
                'taskTermPlurLow' : company.TaskTermPlural,
                'taskTermSingHigh' : company.TaskTermSingular.capitalize(),
                'taskTermPlurHigh' : company.TaskTermPlural.capitalize(),
            }
            $scope.doneRefresh.push("company");
            if ($scope.doneRefresh.length >= 4) {
                deferred.resolve();
            }
            $scope.$parent.$broadcast("pageReady");
            $scope.$apply();
        }
       
        EntityService.getJobClients($scope.Session, false, afterGetJobClients);
        EntityService.getTasks($scope.Session, false, afterGetTasks);
        EntityService.getUser($scope.Session, false, afterGetUser);
        EntityService.getCompany($scope.Session, false, afterGetCompany);

        return deferred.promise;
    }

    /* Update the hour display if you're using duration as your time entry method*/
    function updateDurationDisplay() {
        if ($scope.timeEntryMethod == "duration") {
            TimeEntryService.getInProgressEntry(function (inProgressEntry) {
                $scope.timeEntry.Hours = inProgressEntry.Hours;
                if (($scope.timeEntryMethod == "duration" && !inProgressEntry.Hours)
                    || ($scope.timeEntryMethod == "start-end" && (!inProgressEntry.ISOEndTime || 
                    !inProgressEntry.ISOStartTime))) {
                    $scope.showStartTimer = true;    
                }
            })
        }
    }

    /* Sets the time entry method according to user's permissions,
       starts notifications (notification permissions specified in function 
       found in background.js).

       There are two cases:

        - If it's the same user, we do not set permissions at all because 
          timeEntryMethod and allowReminders are never removed from sync, only updated as needed.

        - If it's not the same user, or this is the first installation, we grab their settings
          according to the managerial permissions set by the CT admin. We will also allow reminders
          by default, since this is not a CT-specified property.
       
       Notifications are started either way. 

       Pending no manual manipulation with the program, timeEntryMethod and allowReminders should always come in a pair. 
       If one exists, it can be assumed that the other also exists, 
       Therefore, we do not account for the case of lonely properties. 
    */
    function updateTimeEntryMethodInStorage() {
       var UserID, RequireStopwatch, RequireStartEndTime, method;
       var pollPeriod = chrome.extension.getBackgroundPage().NOTIFICATION_POLL_PERIOD;

        // Set user id and permissions
        UserID = $scope.user.UserID;
        RequireStopwatch = $scope.user.RequireStopwatch;
        RequireStartEndTime = $scope.user.RequireStartEndTime;

        if (RequireStartEndTime || RequireStopwatch) {
            method = 'start-end'
        } else {
            method = 'duration'
        }

        chrome.storage.sync.get(['timeEntryMethod', 'allowReminders'], function (items) {
            if (('allowReminders' in items) && ('timeEntryMethod' in items)) {
                chrome.extension.getBackgroundPage().createNotifications(pollPeriod);
                $scope.changeTimeEntryMethod(items.timeEntryMethod.method);
                updateDurationDisplay();
            } else {
                if (!('timeEntryMethod' in items) || (UserID != items.timeEntryMethod.UserID)) {
                    chrome.storage.sync.set({
                        'timeEntryMethod' : {
                            'method' : method,
                            'UserID' : UserID
                        }
                    }, function() {
                        $scope.changeTimeEntryMethod(method);
                        updateDurationDisplay();
                    });
                }
            if (!('allowReminders' in items) || (UserID != items.allowReminders.UserID)) {
                chrome.storage.sync.set({
                    'allowReminders' : {
                        'permission' : true,
                        'UserID' : UserID 
                    }
                }, function() {
                    chrome.extension.getBackgroundPage().createNotifications(pollPeriod);
                });
            }
         }
      })        
    }
  

    ///// ONLOAD: This will get executed upon opening the chrome extension. /////////

    // Once page has loaded, send a message that this was loaded.
    $scope.sendPageReady = function() {
        console.log("Sending page ready");
        chrome.runtime.sendMessage({
            pageReady: true
        })
    }
    
    // When this list is populated with 4 entities, the scope is ready. 
    $scope.doneLoading = [];

    /** Get the session, from sync storage if it exists, otherwise call the API.
        Then get all entities. */
    var afterGetSession = function (session) {
        $scope.$parent.Session = session;
        // Default empty entry
        var dateString = CTService.getDateString();
        $scope.timeEntry = {
            "BreakTime":0.00,
            "Comment":"",
            "Date":dateString,
            "Hours":null,
            "ISOEndTime":null,
            "ISOStartTime":null,
            "JobID":"",
            "PhaseID":"",
            "SubPhaseID":null,
            "TaskID":""
        }

        // Go fetch the in progress entry and fill out scope fields, if necessary
        TimeEntryService.getInProgressEntry(function (inProgressEntry) {
            if (inProgressEntry.Date) {
                var yearStr = inProgressEntry.Date.substring(0, 4);
                var monthStr = inProgressEntry.Date.substring(4, 6);
                var monthCorrected = (parseInt(monthStr) - 1) + '';
                var dayStr = inProgressEntry.Date.substring(6, 8);
                var then = new Date(yearStr, monthCorrected, dayStr);
                var now = new Date();
                var msDay = 60*60*24*1000;
                var dayDiff = Math.floor((now - then) / msDay);
                if (dayDiff >= 1 && !$scope.abandonedStopwatch) {
                    if (inProgressEntry.Hours || inProgressEntry.ISOStartTime || inProgressEntry.ISOEndTime) {
                        $scope.abandonedDateString = yearStr + "/" + monthStr + "/" + dayStr;
                        $scope.abandonedEntry = true;
                    }
                   
                }
            }
            $scope.showStartTimer = true;
            $scope.timeEntry.Comment = inProgressEntry.Comment;
            $scope.timeEntry.Date = inProgressEntry.Date;
            if (inProgressEntry.Hours) {
                clearSuccessMessage();
                $scope.showStartTimer = false;
            }
            if (inProgressEntry.ISOStartTime) {
                clearSuccessMessage();
                $scope.showStartTimer = false;
                $scope.timeEntry.ISOStartTime = inProgressEntry.ISOStartTime;
            }
            if (inProgressEntry.ISOEndTime) {
                clearSuccessMessage();
                $scope.showStartTimer = false;
                $scope.timeEntry.ISOEndTime = inProgressEntry.ISOEndTime;
            }
        })
       
        $scope.IsManagerOrAdmin = EntityService.SecurityLevel == 'manager'
            || EntityService.SecurityLevel == 'admin';

        $scope.HasEmptyEntities = false;

        var afterGetTasks = function (tasksList) {
            $scope.allTasks = tasksList;
            if ($scope.jobClient && $scope.company && $scope.company.TaskRestrictionMethod == "byjob") {
                var permittedTaskIDs = $scope.jobClient.job.PermittedTasks.split(",");
                var permittedTasks = [];
                for (i in tasksList) {
                    var t = tasksList[i];
                    if (EntityService.hasTaskID(permittedTaskIDs, t.TaskID)) {
                        permittedTasks.push(t);
                    }
                }
                $scope.tasks = permittedTasks;
            } else {
                $scope.tasks = tasksList;    
            }
            if (tasksList.length == 0) {
                $scope.HasEmptyEntities = true;
                $scope.doneLoading.push('tasks');
                if ($scope.doneLoading.length >= 4) {
                    $scope.sendPageReady();
                    $scope.$emit("pageReady");
                }
                return;
            }
            TimeEntryService.getInProgressEntry(function (inProgressEntry) {
                if (inProgressEntry.task != undefined) {
                    var filteredTasks = $scope.tasks.filter(function (task) { 
                        return task.TaskID == inProgressEntry.task.TaskID
                    })

                    if (filteredTasks.length > 0) {
                        // If in progress entity is in the entity list
                        $scope.task = filteredTasks[0];
                        $scope.timeEntry.task = inProgressEntry.task;
                        $scope.timeEntry.TaskID = inProgressEntry.TaskID;
                        $scope.doneLoading.push('tasks');
                        if ($scope.doneLoading.length >= 4) {
                            $scope.sendPageReady();
                            $scope.$emit("pageReady");
                        }
                        $scope.$apply();
                        return;
                    }           
                }
                // No in progress entity
                $scope.task = tasksList[0];
                if ($scope.task) {
                    $scope.timeEntry.task = $scope.task;
                    $scope.timeEntry.TaskID = $scope.task.TaskID;
                }
                TimeEntryService.updateInProgressEntry("task", $scope.task);
                $scope.doneLoading.push('tasks');
                if ($scope.doneLoading.length >= 4) {
                    $scope.sendPageReady();
                    $scope.$emit("pageReady");
                }
                $scope.$apply();
            })
        }

        var afterGetUser = function (user) {
            $scope.user = user;
            $scope.doneLoading.push('user');
            if ($scope.doneLoading.length >= 4) {
                $scope.sendPageReady();
                $scope.$emit("pageReady");
            }
            $scope.$apply();
            updateTimeEntryMethodInStorage();      
            chrome.storage.sync.get(['stopwatch'], function (items) {
                // Check for abandoned stopwatch
                if ('stopwatch' in items) {
                    var now = new Date();
                    var stopwatch = items.stopwatch;
                    if (stopwatch.running) {
                        var stopwatchDate = new Date(stopwatch.startYear, stopwatch.startMonth,
                            stopwatch.startDay, now.getHours(), now.getMinutes(), now.getSeconds(),
                            now.getMilliseconds());

                        if (now > stopwatchDate) {
                            // There is an abandoned stopwatch
                            StopwatchService.getStartTime(function (startTime) {
                                var start = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate(),
                                    startTime.getHours(), startTime.getMinutes(), 0);
                                var midnight = new Date(2015, 0, 1, 23, 59, 0);
                                $scope.timeEntry.ISOStartTime = start;
                                $scope.timeEntry.ISOEndTime = midnight;
                                TimeEntryService.updateInProgressEntry('startEndTimes', [start, midnight]);
                            })
                            $scope.abandonedStopwatch = true;
                            $scope.runningStopwatch = false;

                            $('#notes-field').css({'width': '248px', 'max-width': '248px'});
                        } else {
                            // There is a running stopwatch, but it isn't abandoned
                            var now = new Date();
                            var end = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                                now.getHours(), now.getMinutes(), 0);
                            $scope.timeEntry.ISOEndTime = end;
                            TimeEntryService.updateInProgressEntry('startEndTimes',
                                    [$scope.timeEntry.ISOStartTime, $scope.timeEntry.ISOEndTime]);

                            $scope.endTimePromise = $interval(function() {
                                var now = new Date();
                                var end = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                                    now.getHours(), now.getMinutes(), 0);
                                $scope.timeEntry.ISOEndTime = end;
                                TimeEntryService.updateInProgressEntry('startEndTimes',
                                    [$scope.timeEntry.ISOStartTime, $scope.timeEntry.ISOEndTime]);
                            }, 30000);
                            $scope.$apply();
                        }
                    }
                }
            })
        }
        
        var afterGetCompany = function (company) {
            if (company.DCAALoggingEnabled || company.HasModuleSubJob) {
                $scope.$parent.DCAASubJobError = true;
                $scope.logout();
            }
            $scope.company = company;
            $scope.customTerms = {
                'clientTermSingLow' : company.ClientTermSingular,
                'clientTermPlurLow' : company.ClientTermPlural,
                'clientTermSingHigh' : company.ClientTermSingular.capitalize(),
                'clientTermPlurHigh' : company.ClientTermPlural.capitalize(),
                'jobTermSingLow' : company.JobTermSingular,
                'jobTermPlurLow' : company.JobTermPlural,
                'jobTermSingHigh' : company.JobTermSingular.capitalize(),
                'jobTermPlurHigh' : company.JobTermPlural.capitalize(),
                'taskTermSingLow' : company.TaskTermSingular,
                'taskTermPlurLow' : company.TaskTermPlural,
                'taskTermSingHigh' : company.TaskTermSingular.capitalize(),
                'taskTermPlurHigh' : company.TaskTermPlural.capitalize(),
            }
            $scope.doneLoading.push('company');
            if ($scope.doneLoading.length >= 4) {
                $scope.sendPageReady();
                $scope.$emit("pageReady");
            }
            $scope.$apply();

        }

        var afterGetTimeEntries = function (timeEntries) {
            var totalHours = 0;
            var timeEntries = timeEntries[0].TimeEntries;
            var arrayLength = timeEntries.length;
            for (var i = 0; i < arrayLength; i++) {
                totalHours += timeEntries[i].Hours;
            }
            var splitHrs = (totalHours + '').split(".");
            var hrs = parseInt(splitHrs[0]);
            var min = null;
            if (splitHrs.length == 2) {
                var min = parseFloat('0.' + splitHrs[1]);
                min = Math.floor(min * 60);
            }
            $scope.totalHoursLogMessage = CTService.getLogMessage(hrs, min);
            $scope.zeroHoursEncouragementMessage = CTService.getZeroHoursMessage(hrs, min);
        }

        var afterGetJobClients = function (jobClientsList) {
            $scope.jobClients = jobClientsList;

            if ($scope.jobClients.length == 0) {
                $scope.HasEmptyEntities = true;
                $scope.jobClient = undefined;
                $scope.doneLoading.push("jobClients");
                if ($scope.doneLoading.length >= 4) {
                    $scope.sendPageReady();
                    $scope.$emit("pageReady");
                }
                $scope.$apply();
            } else {
                TimeEntryService.getInProgressEntry(function (inProgressEntry) {
                    if (inProgressEntry.job != undefined) {
                        var filteredJobClients = $scope.jobClients.filter(function (jobClient) { 
                            return jobClient.job.JobID == inProgressEntry.job.JobID 
                                && jobClient.job.ClientID == inProgressEntry.client.ClientID
                                && jobClient.client.ClientID == inProgressEntry.client.ClientID;
                        })

                        if (filteredJobClients.length > 0) {
                            // If in progress entity is in the entity list
                            $scope.jobClient = filteredJobClients[0];
                            $scope.timeEntry.job = inProgressEntry.job;
                            $scope.timeEntry.JobID = inProgressEntry.JobID;
                            $scope.timeEntry.client = inProgressEntry.client;
                            $scope.doneLoading.push("jobClients");
                            if ($scope.doneLoading.length >= 4) {
                                $scope.sendPageReady();
                                $scope.$emit("pageReady");
                            }
                            $scope.$apply();
                            return;
                        }           
                    } 
                    // No in progress entity
                    $scope.jobClient = $scope.jobClients[0];
                    $scope.timeEntry.job = $scope.jobClient.job;
                    $scope.timeEntry.JobID = $scope.jobClient.job.JobID;
                    $scope.timeEntry.client = $scope.jobClient.client;
                    TimeEntryService.updateInProgressEntry("job", $scope.jobClient.job, function () {
                        TimeEntryService.updateInProgressEntry("client", $scope.jobClient.client);
                    });
                    $scope.doneLoading.push("jobClients");
                    if ($scope.doneLoading.length >= 4) {
                        $scope.sendPageReady();
                        $scope.$emit("pageReady");
                    }
                    $scope.$apply();
                
                })
            }

            
        }
        EntityService.getJobClients(session, true, afterGetJobClients);
        EntityService.getTasks(session, true, afterGetTasks);
        EntityService.getUser(session, true, afterGetUser);
        EntityService.getCompany(session, true, afterGetCompany);
        EntityService.getTimeEntries(session, afterGetTimeEntries);
        
    }
    EntityService.getSession(afterGetSession);


    // Show offline message if you don't have internet
    var offlineBox;
    window.addEventListener('offline', function(e) {
        offlineBox = bootbox.dialog({
            message: "We're sorry, you don't appear to have an internet connection. Please try again when you have connectivity.",       
            show: true,
            backdrop: true,
            closeButton: false,
            animate: true,
            className: "no-internet-modal",
        });
    }, false);
    
    setInterval(function(){ 
        window.addEventListener('online', function(e) {
            offlineBox.modal('hide');
        }, false);
    }, 3000);
}])
