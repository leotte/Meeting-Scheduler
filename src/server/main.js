/*
 * Meeting Scheduler — web app entry points (Apps Script only).
 * Functions ending in "_" are private: google.script.run cannot call them.
 */

var ORGANIZER_ONLY = 'This page is for the organizer only.';

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.poll) {
    return renderPage_('invitee', { pollId: String(params.poll) }, 'Meeting availability');
  }
  if (!isOwner_(params.admin)) {
    return renderPage_('message', { title: 'Organizer only', message: ORGANIZER_ONLY }, 'Meeting Scheduler');
  }
  return renderPage_('organizer', { baseUrl: getBaseUrl_(), adminKey: params.admin || '' }, 'Meeting Scheduler');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function renderPage_(name, boot, title) {
  var template = HtmlService.createTemplateFromFile(name);
  template.bootJson = JSON.stringify(boot).replace(/</g, '\\u003c');
  return template.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function isOwner_(key) {
  var active = '';
  try {
    active = Session.getActiveUser().getEmail() || '';
  } catch (err) {
    active = '';
  }
  var owner = Session.getEffectiveUser().getEmail() || '';
  if (active && owner && active.toLowerCase() === owner.toLowerCase()) return true;
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!(stored && key && String(key) === stored);
}

function getBaseUrl_() {
  return PropertiesService.getScriptProperties().getProperty('BASE_URL') || ScriptApp.getService().getUrl();
}

function newId_() {
  var hex = Utilities.getUuid().replace(/-/g, '');
  var positions = [0, 2, 4, 6, 8, 10, 20, 22]; // skip the UUID version and variant digits
  return Logic.idFromBytes(positions.map(function (p) { return parseInt(hex.substr(p, 2), 16); }));
}

function service_() {
  return Service.create(SheetStore.open(), {
    newId: newId_,
    now: function () { return new Date().toISOString(); }
  });
}

function run_(options, fn) {
  var result = Service.envelope(function () {
    if (options.owner && !isOwner_(options.key)) {
      throw new Service.ServiceError('not_owner', ORGANIZER_ONLY);
    }
    var lock = null;
    if (options.write) {
      lock = LockService.getScriptLock();
      lock.waitLock(20000);
    }
    try {
      return fn();
    } finally {
      if (lock) lock.releaseLock();
    }
  });
  if (!result.ok && result.code === 'server_error') {
    console.error(result.message); // visible in the Apps Script Executions log
    if (!options.owner) result.message = 'Something went wrong.'; // never show internal errors to invitees
  }
  if (!result.ok && result.code === 'sheet_missing' && !options.owner) {
    result.message = 'This poll is no longer available.'; // invitees never see the organizer's wording
  }
  return result;
}

// ---- Organizer API (owner only) --------------------------------------------

function apiListPolls(key) {
  return run_({ owner: true, key: key }, function () { return service_().listPolls(); });
}

function apiGetPoll(key, pollId) {
  return run_({ owner: true, key: key }, function () { return service_().getPoll(pollId); });
}

function apiSavePoll(key, draft) {
  return run_({ owner: true, key: key, write: true }, function () { return service_().savePoll(draft); });
}

function apiDeletePoll(key, pollId) {
  return run_({ owner: true, key: key, write: true }, function () { return service_().deletePoll(pollId); });
}

function apiCreateDataSheet(key) {
  return run_({ owner: true, key: key, write: true }, function () {
    SheetStore.createNew();
    return { created: true };
  });
}

// ---- Invitee API (anyone with the link) ------------------------------------

function apiGetPublicPoll(pollId) {
  return run_({}, function () { return service_().getPublicPoll(pollId); });
}

function apiSaveResponse(pollId, inviteeId, blockIds, version) {
  return run_({ write: true }, function () {
    return service_().saveResponse(pollId, inviteeId, blockIds, version);
  });
}

// ---- Setup helper: run by hand from the Apps Script editor -----------------

function setupAdminKey() {
  if (!isOwner_('')) throw new Error(ORGANIZER_ONLY);
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ADMIN_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('ADMIN_KEY', key);
  }
  Logger.log('Organizer link: add ?admin=' + key + ' to the end of your web app URL.');
}
