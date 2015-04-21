// TODO: Wrap in a scoped function; attach to this or window
var siteCore = siteCore || {};

// Initialize the activesave "namespace"
siteCore.activesave = siteCore.activesave || {};

// Initialize the registered forms. Registered forms will hold information for each
// form for which activesave is turned on
siteCore.activesave.registeredForms = siteCore.activesave.registeredForms || {};

// Extend jQuery with activesave.
// activesave stores form/record information local to the client.
// When attached, any currently stored local information will overwrite current form values
// When an unload event is detected, the form is saved
// The user of activesave can also trigger the activesave-push event to update the local cache
// If forms will be unloaded / removed from the DOM dynamically, the user of activesave is
// responsible for triggering appropriate events (e.g. activesave-push, to save it locally, or
// activesave-persist, to submit it to the server)
// activesave accepts a scope, such as a user-specific namespace to save on a per-user basis,
// and a preSubmit function, which will be called prior to a server save, during which the user
// can push elements/values into the form, if needed, or validate the form beyond any built-in
// validations. The preSubmit function should return true to continue with the save and false if
// the save should be cancelled/avoided
// Note: Forms must have an id attribute to be activesaved
// Note: subscope, or the key identifying the form within the local storage scope, should be specified
//       with a data attribute of name activesave-subscope, e.g. <form id="myform" data-activesave-subscope="myform">...
// Example usage: $('#myform').activesave();
jQuery.fn.activesave = function (options) {
    var settings = {
        scope: 'global',
        preSubmit: function (targetForm) { return true; }
    }

    if (options) {
        jQuery.extend(settings, options);
    };

    return this.filter('form[id]').each(function () {
        // Register form
        var registeredForm = {};
        siteCore.activesave.registeredForms[$(this).prop('id')] = registeredForm;

        registeredForm.scope = settings.scope || 'global';
        registeredForm.subscope = $(this).data('activesave-subscope') || null;
        registeredForm.form = this;

        // Get a checksum/hashcode for the form as it exists at load
        registeredForm.checksum = $(this).serialize().hashCode();
        registeredForm.isDirty = false;

        // Add the preSubmit, if specified
        if (settings.preSubmit != null && typeof settings.preSubmit === 'function') {
            registeredForm.preSubmit = settings.preSubmit;
        }

        // Override the submit function
        $(this).off('submit').on('submit', function () {
            var registeredForm = siteCore.activesave.registeredForms[$(this).prop('id')];

            // Execute and check the results of any configured preSubmit function
            if (registeredForm.preSubmit && !registeredForm.preSubmit(this)) {
                return false;
            }

            // Perform normal form validation
            $(this).validate();

            if (!$(this).valid()) {
                return false;
            }

            // Check for changes
            var currentChecksum = $(this).serialize().hashCode();
            if (!registeredForm.isDirty && currentChecksum === registeredForm.checksum) {
                // No changes
                return false;
            }

            // Prepare the form for submission
            var action = $(this).attr('action');
            var method = $(this).attr('method');
            method = ((typeof method !== 'undefined' && method != null && method.length > 0) ? method.toUpperCase() : 'GET');

            // Remove any hidden elements that also have a visible item of the same name
            var removedInputs = [];

            $(this).find('input[type="hidden"]').each(function () {
                // Check for any input except those which will not be sent (unchecked checkboxes)
                if ($(registeredForm.form).find(':input:not([type="hidden"]):not([type="checkbox"])[name="' + $(this).attr('name') + '"]').length > 0) {
                    removedInputs.push($(this).detach());
                }
                else if ($(registeredForm.form).find(':input[type="checkbox"][name="' + $(this).attr('name') + '"]:checked').length > 0) {
                    removedInputs.push($(this).detach());
                }
                    // Check for any hiddens further down the chain
                else if ($(registeredForm.form).find('input[type="hidden"][name="' + $(this).attr('name') + '"]').length > 1) {
                    removedInputs.push($(this).detach());
                }
            })

            var data = $(this).serialize();

            // Restore the stripped data
            var $attachPoint = $(this).children().first();
            for (var i = removedInputs.length - 1; i >= 0; i--) {
                $(this).children().first().before(removedInputs[i]);
            }

            // Submit the form
            $.ajax({
                url: action,
                method: method,
                data: data,
                async: true,
                cache: false,
                success: function (data, statusMessage, xhr) {
                    var jsonStatus = null;
                    var jsonHeader = xhr.getResponseHeader('X-Responded-JSON');
                    if (jsonHeader != null) {
                        var responseJson = $.parseJSON(jsonHeader);
                        if (responseJson != null) {
                            jsonStatus = responseJson.status;
                        }
                    }
                    if (xhr.status == 200 && (jsonStatus == null || jsonStatus == 200)) {
                        // Save succeeded
                        registeredForm.isDirty = false;
                        registeredForm.checksum = currentChecksum;
                        $(document).trigger('activesave-persisted', [registeredForm.scope, registeredForm.subscope]);
                    }
                },
                error: function (xhr) {
                }
            });

            return false;
        });

        // Append any currently-saved information to the form and save locally the current form contents
        $(document).trigger('activesave-append', [this]);
        $(document).trigger('activesave-push', [this]);
        return this;
    });
};

// Get the local storage key, in the format scope[::subscope]
siteCore.activesave.getKey = function (subscope, scope) {
    scope = scope || 'global';
    return scope + ((typeof subscope !== 'undefined' && subscope != null && subscope.length > 0) ? '::' + subscope : '');
};

// Retrieve the named value from local storage; if name is null, the entire local storage payload will be returned
siteCore.activesave.retrieve = function (name, subscope, scope) {
    var key = siteCore.activesave.getKey(subscope, scope);
    var values = window.JSON.parse(window.localStorage.getItem(key));

    if (typeof name !== 'undefined' && name != null) {
        if (typeof values !== 'undefined' && values != null) {
            return values[name];
        }

        return null;
    }

    return values;
}

// Remove the named value from local storage; if name is null, the entire contents of local storage will be removed
siteCore.activesave.remove = function (name, subscope, scope) {
    var key = siteCore.activesave.getKey(subscope, scope);

    if (typeof name !== 'undefined' && name != null) {
        var values = window.JSON.parse(window.localStorage.getItem(key));
        if (typeof values !== 'undefined' && values != null) {
            var index = $(values.name).index();
            if (index > -1) {
                values.splice(index, 1);
            }
            window.localStorage.setItem(key, window.JSON.stringify(values));
        }
    }
    else {
        window.localStorage.removeItem(key);
    }
}

// Set the named value in local storage or, if the form is present in the DOM, in the form istelf
siteCore.activesave.set = function (name, value, subscope, scope) {
    scope = scope || 'global';

    // First attempt to set on the form itself
    var formSet = false;
    if (siteCore.activesave.registeredForms) {
        for (var formName in siteCore.activesave.registeredForms) {
            var registeredForm = siteCore.activesave.registeredForms[formName];
            if (registeredForm.scope === scope && registeredForm.subscope === subscope || null) {
                siteCore.activesave.setField(registeredForm, registeredForm.form, name, value);
                formSet = true;
                break;
            }
        }
    }

    // Not set in form; set in local storage
    if (!formSet) {
        var key = scope + ((typeof subscope !== 'undefined' && subscope != null && subscope.length > 0) ? "::" + subscope : '');
        var values = window.JSON.parse(window.localStorage.getItem(key)) || {};
        values[name] = value;
        window.localStorage.setItem(key, window.JSON.stringify(values));
    }
}

// A set of named values to load/append at a later time due to contents being asynchronously-loaded 
siteCore.activesave.deferredValues = siteCore.activesave.deferredValues || {};

// Set a named value in the form
siteCore.activesave.setField = function (target, form, name, value) {
    var $form = $(form);
    var $elem = $form.find(':input[name="' + name + '"]');
    if ($elem.length > 0) {
        for (var i = 0; i < $elem.length; i++) {
            var $thisElem = $($elem[i]);
            if ($thisElem.prop('type') == 'checkbox') {
                $thisElem.prop('checked', (value === true || value === 'true' || value == 'True'));

                // In ASP.NET MVC, a hidden will be added after each checkbox with a fixed value of false;
                // This value should not be overwritten, as it is used to set the bound value in the model
                // to false in the event the checkbox is not set; this value should not be overwritten,
                // so we will skip setting it
                i++;
            }
            else if ($thisElem.prop('tagName') == 'SELECT') {
                if ($thisElem.val() !== value) {
                    $thisElem.val(value);
                    if ($thisElem.data('async-load') === true || $thisElem.data('async-load') === 'true') {
                        siteCore.activesave.deferredValues[$thisElem.prop('id')] = value;
                        $thisElem.one('async-load', function (e) {
                            $(this).val(siteCore.activesave.deferredValues[$(this).prop('id')]);
                            delete siteCore.activesave.deferredValues[$(this).prop('id')];
                            $form.trigger('activesave-append-completed-async', [$(this).prop('id')]);

                            // Reset the checksum to reflect new values
                            target.checksum = $form.serialize().hashCode();

                            $(this).off('async-load');
                        });
                    }
                }
            }
            else {
                $thisElem.val(value);
            }
        }
    }
    else {
        $form.append(function () {
            return '<input type="hidden" name="' + name + '" value="' + value + '" />';
        })
    }
}

// Attach to the unload event to save all activesave forms when the user navigates away or closes the browser
$(window).off('unload').on('unload', function () {
    $(document).trigger('activesave-unload');
});

// When the activesave-unload event is triggered, save the forms, then flush them if the save succeeded, then remove them from registered forms
$(document).off('activesave-unload').on('activesave-unload', function (e, requestedTargets) {
    var targets = {};
    if (typeof requestedTargets !== 'undefined' && requestedTargets != null) {
        var $requestedTargets = (requestedTargets instanceof jQuery) ? requestedTargets : $(requestedTargets);
        $requestedTargets.filter('form[id]').each(function () {
            if (siteCore.activesave.registeredForms[$(this).prop('id')]) {
                targets[$(this).prop('id')] = siteCore.activesave.registeredForms[$(this).prop('id')];
            }
        });
    }
    else {
        targets = siteCore.activesave.registeredForms;
    }

    // Attach to activesave-persisted event
    for (var name in targets) {
        $(document).one('activesave-persisted', function (e, scope, subscope) {
            // Server has latest; remove from local storage
            siteCore.activesave.remove(null, subscope, scope);
        });
    }

    // Trigger activesave-persist to save forms to server
    $(document).trigger('activesave-persist', [requestedTargets]);

    // Remove from registered forms
    for (var name in targets) {
        delete targets[name];
    }
});

// When the activesave-persist event is triggered, save the forms (first locally, then by submission to the server);
// optionally, for named forms
$(document).off('activesave-persist').on('activesave-persist', function (e, requestedTargets) {
    $(document).trigger('activesave-push', [requestedTargets]);

    var targets = {};
    if (typeof requestedTargets !== 'undefined' && requestedTargets != null) {
        var $requestedTargets = (requestedTargets instanceof jQuery) ? requestedTargets : $(requestedTargets);
        $requestedTargets.filter('form[id]').each(function () {
            if (siteCore.activesave.registeredForms[$(this).prop('id')]) {
                targets[$(this).prop('id')] = siteCore.activesave.registeredForms[$(this).prop('id')];
            }
        });
    }
    else {
        targets = siteCore.activesave.registeredForms;
    }

    for (var name in targets) {
        console.log('Attempting to save ' + siteCore.activesave.getKey(targets[name].subscope, targets[name].scope));
        $(targets[name].form).submit();
    }
});

// When the activesave-push event is triggered, save the forms locally
$(document).off('activesave-push').on('activesave-push', function (e, requestedTargets) {
    var targets = {};
    if (typeof requestedTargets !== 'undefined' && requestedTargets != null) {
        var $requestedTargets = (requestedTargets instanceof jQuery) ? requestedTargets : $(requestedTargets);
        $requestedTargets.filter('form[id]').each(function () {
            if (siteCore.activesave.registeredForms[$(this).prop('id')]) {
                targets[$(this).prop('id')] = siteCore.activesave.registeredForms[$(this).prop('id')];
            }
        });
    }
    else {
        targets = siteCore.activesave.registeredForms;
    }

    // Attach each form element to the tracked values
    for (var name in targets) {
        var target = targets[name];
        var $form = $(target.form);

        // Check for changes
        if ($form.serialize().hashCode() !== target.checksum) {
            target.isDirty = true;
        }

        var key = target.scope + ((target.subscope != null && target.subscope.length > 0) ? "::" + target.subscope : "");
        var values = window.JSON.parse(window.localStorage.getItem(key)) || {};
        $form.find(':input')
            .sort(function (a, b) {
                // Put hidden at the beginning - for checkboxes, MVC emits a hidden field of the same name;
                // its value will not be current, so it will be stored and then replaced by the checkbox
                var typeA = $(a).prop('type');
                var typeB = $(b).prop('type');
                if (typeA == 'hidden') {
                    if (typeB != 'hidden') {
                        return -1;
                    }
                    return 0;
                }
                if (typeB == 'hidden') {
                    return 1
                }
                return 0;
            })
            .each(function () {
                var type = $(this).prop('type');
                if (type == 'checkbox') {
                    values[$(this).prop('name')] = $(this).prop('checked');
                }
                else {
                    values[$(this).prop('name')] = $(this).val();
                }
            });

        window.localStorage.setItem(key, window.JSON.stringify(values));
    }
});

// When the activesave-append event is triggered, push the locally saved values into the form
$(document).off('activesave-append').on('activesave-append', function (e, requestedTargets) {
    var targets = {};
    if (typeof requestedTargets !== 'undefined' && requestedTargets != null) {
        var $requestedTargets = (requestedTargets instanceof jQuery) ? requestedTargets : $(requestedTargets);
        $requestedTargets.filter('form[id]').each(function () {
            if (siteCore.activesave.registeredForms[$(this).prop('id')]) {
                targets[$(this).prop('id')] = siteCore.activesave.registeredForms[$(this).prop('id')];
            }
        });
    }
    else {
        targets = siteCore.activesave.registeredForms;
    }

    for (var targetName in targets) {
        var target = targets[targetName];
        var $form = $(target.form);
        var key = target.scope + ((target.subscope != null && target.subscope.length > 0) ? "::" + target.subscope : "");
        var values = window.JSON.parse(window.localStorage.getItem(key));
        for (var name in values) {
            siteCore.activesave.setField(target, target.form, name, values[name]);
        }

        $form.trigger('activesave-append-completed', [target.scope, target.subscope]);

        // Reset the checksum to reflect new values
        target.checksum = $form.serialize().hashCode();
    }
});
