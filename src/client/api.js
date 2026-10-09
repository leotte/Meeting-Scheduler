/* Promise wrapper around google.script.run. Resolves with data; rejects with {code, message}. */
var Api = (function () {
  function call(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      var runner = google.script.run
        .withSuccessHandler(function (res) {
          if (res && res.ok) resolve(res.data);
          else reject({ code: (res && res.code) || 'server_error', message: (res && res.message) || '' });
        })
        .withFailureHandler(function (err) {
          reject({ code: 'network', message: String((err && err.message) || err) });
        });
      runner[name].apply(runner, args);
    });
  }

  return { call: call };
})();
