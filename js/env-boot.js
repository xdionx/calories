// Runs before anything else on the page (classic script in <head>).
// On the test site it keeps the test copy away from the live copy:
// both live on xdionx.github.io, so without this they would share the same
// browser storage and the test app could change your real food log.
(function () {
  var env = window.FUEL_ENV || 'live';
  if (env === 'live') return;

  // Give every storage key a "test:" prefix, so test data sits beside the
  // live data instead of on top of it (this covers the Supabase sign-in too).
  var prefix = env + ':';
  var S = Storage.prototype;
  var get = S.getItem, set = S.setItem, remove = S.removeItem;
  S.getItem = function (k) { return get.call(this, prefix + k); };
  S.setItem = function (k, v) { return set.call(this, prefix + k, v); };
  S.removeItem = function (k) { return remove.call(this, prefix + k); };
  S.clear = function () {
    for (var i = this.length - 1; i >= 0; i--) {
      var k = S.key.call(this, i);
      if (k && k.indexOf(prefix) === 0) remove.call(this, k);
    }
  };

  var build = window.FUEL_BUILD;
  var buildText = build ? ' · Build ' + build.n : '';
  var root = document.documentElement;
  root.classList.add('env-test');
  document.title = 'TEST ' + (build ? 'b' + build.n + ' ' : '') + '· ' + document.title;

  function banner() {
    if (document.getElementById('env-banner')) return;
    var b = document.createElement('div');
    b.id = 'env-banner';
    b.className = 'env-banner';
    b.setAttribute('role', 'status');
    b.innerHTML = '<strong>Test version' + buildText + '</strong><span>Your live app and its log are not touched.</span>';
    document.body.insertBefore(b, document.body.firstChild);
  }
  if (document.body) banner();
  else document.addEventListener('DOMContentLoaded', banner);
})();
