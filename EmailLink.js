define(['jquery', 'qlik', 'angular', 'ng!$q', 'css!./css/emailLink.css'], function ($, qlik, angular, $q) {

    //define the separator used in GetCurrentSelections function call
    var recordSeparator = '&@#$^()';
    var tagSeparator = '::::';
    var valueSeparator = ';;;;';
    var editModePathnameDetector = "/state/edit";


    return {

        //define the properties panel looks like
        definition: {
                type: "items",
                component: "accordion",
                items: {
                    //selection-specific options - max number of selected values in one field and "too many selections in 1 field" error message
                    selectionOptions: {
                        type: "items",
                        label: "Selection options",
                        items: {
                            maxSelectedValues: {
                                ref: "maxSelectedValues",
                                type: "integer",
                                label: "Max number of values selected in one field",
                                defaultValue: "1000",
                                min: 1
                            },
                            tooManySelectionsMadeErrorMessage: {
                                ref: "tooManySelectionsMadeErrorMessage",
                                type: "string",
                                label: "Error message for too many selections",
                                defaultValue: "Too many selections"
                            }
                        }
                    },

                }
            }, 

            paint: function ($element, layout) {


                //layout variables
                var showLinkOrName = layout.linkOrName;
                //var name = '✉';
				var ibody = true;
				var extensionName = '✉';
                var self = this;
				var mailTopic = 'A Qlik Sense link you should look at';
				var mailRecipient = '';
				var mailBody = '';


                //helper function for creating App Integration API's URI part responsible for selections
                var createSelectionURLPart = function (fieldSelections,checkForTooManySelections) {
                    var returnObject = {
                        selectionURLPart : "",
                        tooManySelectionsPossible : false,
                        suspectedFields : []
                    };
                    fieldSelections.forEach(function (item) {
                        //"logic" for detecting if the selection information provided is in the "x of y values" form
                        if (checkForTooManySelections && (item.includes(" of ") || item == "ALL" || item.includes("NOT")) && item.split(valueSeparator).length == 1) {
                            returnObject.tooManySelectionsPossible = true;
                            returnObject.suspectedFields.push(item.split(tagSeparator)[0]);
                        }
                        else {
                            returnObject.selectionURLPart += "/select/"+encodeURIComponent(item.split(tagSeparator)[0]) + "/" + encodeURIComponent(item.split(tagSeparator)[1].replace(tagSeparator,";"));
                        }
                    });
                    return returnObject;
                };

                
                //helper funciton for adding on "qv-activate" event of button/link
                var addOnActivateButtonEvent = function (url,recipient,topic,body) {
                    var emailFriendlyUrl = encodeURIComponent(url);
                    $("#sendEmailExtensionAction").on('qv-activate', function () {
                        window.location.href = 'mailto:' + recipient + '?subject=' + topic + '&body=' + body+emailFriendlyUrl;
                        window.onbeforeunload = null;
                        return false;
                    });
                    $("#sendEmailExtensionAction").text(layout.name);
                    $("#sendEmailExtensionAction").prop("disabled",false);
                }

                var elementWidth = $element.width();
                var elementHeight = $element.height();

                //obtaining global object to use it for generating the first part of the App Integration API's URI (host/ip, app id, sheet id)
                var config = {
                    host: window.location.hostname,
                    prefix: window.location.pathname.substr(0, window.location.pathname.toLowerCase().lastIndexOf("/extensions") + 1),
                    port: window.location.port,
                    isSecure: window.location.protocol === "https:"
                };

                var global = qlik.getGlobal(config);

                //get application and sheet

                var app = qlik.currApp(this);
                var applicationId = app.model.layout.qFileName;

                if (applicationId.substring(applicationId.length - 4) == '.qvf') {
                    applicationId = applicationId.slice(0, -4);
                }
                var applicationIdFr = encodeURIComponent(applicationId);


                var CurrentSheet = qlik.navigation.getCurrentSheetId();
                var SheetID = CurrentSheet.sheetId;

                //create first part of the App Integration API's URI
                var baseUrl = (config.isSecure ? "https://" : "http://" ) + config.host + (config.port ? ":" + config.port : "" ) + "/sense/app/" + applicationIdFr + "/sheet/" + SheetID + "/state/analysis/options/clearselections";


                //create the button/link
                $element.html('<button name="'+extensionName+'" id="sendEmailExtensionAction" class="emailLink-btn emailLink-btn emailLink-auto-width emailLink-btn-primary">✉</button>');

                //do not do anything if in edit mode
                if(window.location.pathname.includes(editModePathnameDetector))
                    return;

                


                var maxNumOfValuesToSelectInField = layout.maxSelectedValues;
                maxNumOfValuesToSelectInField = maxNumOfValuesToSelectInField<1?1:maxNumOfValuesToSelectInField;

                //create a cube with the GetCurrentSelections expression
                app.createCube({
                    qMeasures : [
                        {
                            qDef : {
                               qDef : "=GetCurrentSelections('"+recordSeparator+"','"+tagSeparator+"','"+valueSeparator+"',"+maxNumOfValuesToSelectInField+")"
                            }
                        }
                    ],
                    qInitialDataFetch : [{
                        qTop : 0,
                        qLeft : 0,
                        qHeight :1,
                        qWidth : 1
                    }]
                }, function(reply) {
                    if(reply.qHyperCube.qDataPages[0].qMatrix[0][0].qText && reply.qHyperCube.qDataPages[0].qMatrix[0][0].qText != '-') {
                        //split the reply and iterate thru fields
                        var fieldSelections = reply.qHyperCube.qDataPages[0].qMatrix[0][0].qText.split(recordSeparator);
                        if (fieldSelections.length > 0) {
                            //create a part of the App Integration API's URI responsible for selections
                            var selectionPartOfURL = createSelectionURLPart(fieldSelections,true);
                            if(selectionPartOfURL.tooManySelectionsPossible)
                            {

                                //console.log("Possible 'x of y values' returned. Need to double check. There is/are "+selectionPartOfURL.suspectedFields.length+" dimension(s) suspected");
                                //if "too many selections" situation is create another hypercube, which retrieves the number of selected values for all "suspicious" fields
                                var measuresDef = [];

                                selectionPartOfURL.suspectedFields.forEach(function(field)
                                {
                                    var measureDefinition = {
                                        qDef : {
                                            qDef : "=GetSelectedCount(["+field+"],True())"
                                        }
                                    };
                                    measuresDef.push(measureDefinition);
                                });

                                app.createCube({
                                    qMeasures : measuresDef,
                                    qInitialDataFetch : [{
                                        qTop : 0,
                                        qLeft : 0,
                                        qHeight : 1,
                                        qWidth : selectionPartOfURL.suspectedFields.length
                                    }]
                                }, function(reply) {
                                    var tooManySelectionsMade = false;
                                    reply.qHyperCube.qDataPages[0].qMatrix[0].forEach(function (suspectedSelection)
                                    {
                                        //check if the number of selected values is > "Max number of values selected in one field" property
                                        if(parseInt(suspectedSelection.qText) > layout.maxSelectedValues)
                                            tooManySelectionsMade = true;
                                    });
                                    if(tooManySelectionsMade)
                                    {
                                        //if this is a case for at least one field, disable the button
                                        $("#sendEmailExtensionAction").text(layout.tooManySelectionsMadeErrorMessage);
                                        $("#sendEmailExtensionAction").prop("disabled",true);
                                    }
                                    else
                                    {
                                        //false alarm (for example some field has actual value that follows the "x of y" pattern); activate the button
                                        var selectionPartOfURL = createSelectionURLPart(fieldSelections,false);
                                        addOnActivateButtonEvent(baseUrl+selectionPartOfURL.selectionURLPart,mailRecipient,mailTopic,mailBody);
                                    }

                                  }
                                );
                            }
                            else
                            {
                                //activate the button with selections
                                addOnActivateButtonEvent(baseUrl+selectionPartOfURL.selectionURLPart,mailRecipient,mailTopic,mailBody);
                            }
                        }
                        else
                            //activate the button (no selections made)
                            addOnActivateButtonEvent(baseUrl,mailRecipient,mailTopic,mailBody);
                    }
                    else
                        //activate the button (no selections made)
                        addOnActivateButtonEvent(baseUrl,mailRecipient,mailTopic,mailBody);
                });
            }
        };
    }
); 



