###ActiveSave.js###

Extends jQuery to add support for active saving of content.
Forms are inventoried. When the document passes out of scope
(i.e. is unloaded), content is pushed automatically to the
server using the original form action and method.

Offers events to push activesave form data locally, using
HTML 5 local storage, append local content onto the form to
refresh from local cache, and persist form data to the server.
