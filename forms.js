/* TenaIQ website forms: "Book a discovery call" (contact.html) and "Telemedicine 101" registration.
   Both talk to the TenaIQ API (the Flask app). */
(function () {
  'use strict';

  /* ==================================================================================
     SET THIS ONCE: the address where your Flask API is running.
     On localhost it automatically uses http://localhost:5000 for testing.
     ================================================================================== */
  var API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://tenaiq-api.onrender.com';

  var PHONE = '0725 090 451';
  var EMAIL_RE = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/;
  var PHONE_RE = /^\+?[0-9][0-9 ()\-]{5,19}$/;

  function send(path, body) {
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 15000);
    return fetch(API_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
      .finally(function () { clearTimeout(timer); });
  }

  // Small toolkit shared by both forms: inline errors, status banner, busy button.
  function kit(form) {
    var statusEl = form.querySelector('#form-status'), btn = form.querySelector('button[type=submit]');
    var label = btn.querySelector('.btn-label'), idle = label.textContent;
    var api = {
      $: function (id) { return form.querySelector('#' + id); },
      status: function (kind, msg) {
        statusEl.className = 'form-status ' + kind; statusEl.textContent = msg; statusEl.hidden = false;
        statusEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      },
      hideStatus: function () { statusEl.hidden = true; },
      setErr: function (id, msg) {
        var el = api.$(id); if (!el) return;
        var box = el.closest('.field') || el.closest('.consent-wrap') || el.closest('.checks');
        var e = box.querySelector('.err[data-for="' + id + '"]');
        if (msg) {
          if (!e) { e = document.createElement('p'); e.className = 'err'; e.dataset.for = id; e.id = 'err-' + id; e.setAttribute('role', 'alert'); box.appendChild(e); }
          e.textContent = msg; el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', e.id);
        } else { if (e) e.remove(); el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
      },
      showErrors: function (errs, focusFallback) {
        var keys = Object.keys(errs);
        keys.forEach(function (k) { api.setErr(k, errs[k]); });
        if (keys.length) { var first = api.$(keys[0]) || focusFallback; if (keys[0] === 'slots') first = form.querySelector('input[name=slot]') || focusFallback; if (first && first.focus) first.focus(); }
      },
      busy: function (on, text) { btn.disabled = on; label.textContent = on ? (text || 'Sending…') : idle; }
    };
    return api;
  }

  // =========================== Book a discovery call ===========================
  function initBooking() {
    var f = document.querySelector('#contact-form'); if (!f) return;
    var k = kit(f), $ = k.$;
    var dateEl = $('date'), slotsEl = $('slots');
    var FIELDS = ['name', 'email', 'phone', 'org', 'type', 'time', 'msg', 'slots', 'consent'];
    var SERVER_KEY = { org_type: 'type', launch: 'time', message: 'msg', slot: 'slots' };
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    var today = new Date(), last = new Date(); last.setDate(last.getDate() + 30);
    dateEl.min = ymd(today); dateEl.max = ymd(last);

    function hint(text) { var p = document.createElement('p'); p.className = 'slot-hint'; p.textContent = text; return p; }
    var seq = 0;
    function loadSlots() {
      var d = dateEl.value, my = ++seq; k.setErr('slots', '');
      slotsEl.replaceChildren(hint(d ? 'Checking available times…' : 'Pick a date to see available times.'));
      if (!d) return;
      fetch(API_BASE + '/api/slots?date=' + encodeURIComponent(d))
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (my !== seq) return;
          if (!res.ok || !res.j.ok) throw new Error('bad');
          if (!res.j.slots.length) { slotsEl.replaceChildren(hint(res.j.message || 'No times available on this day. Please pick another date.')); return; }
          slotsEl.replaceChildren.apply(slotsEl, res.j.slots.map(function (s) {
            var l = document.createElement('label'); l.className = 'slot';
            var i = document.createElement('input'); i.type = 'radio'; i.name = 'slot'; i.value = s.start;
            var t = document.createElement('span'); t.textContent = s.label; l.append(i, t); return l;
          }));
        })
        .catch(function () { if (my === seq) slotsEl.replaceChildren(hint('We could not load times just now. Please try again, or call ' + PHONE + '.')); });
    }
    dateEl.addEventListener('change', loadSlots);
    slotsEl.addEventListener('change', function () { k.setErr('slots', ''); });
    FIELDS.forEach(function (id) { var el = $(id); if (el && id !== 'slots') el.addEventListener('input', function () { k.setErr(id, ''); }); });

    function check() {
      var e = {}, g = function (id) { return $(id).value.trim(); };
      if (g('name').length < 2) e.name = 'Please enter your full name.';
      if (!EMAIL_RE.test(g('email'))) e.email = 'Please enter a valid email address.';
      if (g('phone') && !PHONE_RE.test(g('phone'))) e.phone = 'Please enter a valid phone number, or leave it blank.';
      if (g('org').length < 2) e.org = 'Please enter your organisation.';
      if (g('msg').length < 5) e.msg = 'Please tell us a little about what you want to build.';
      if (!dateEl.value) e.slots = 'Please choose a date, then a time.';
      else if (!f.querySelector('input[name=slot]:checked')) e.slots = 'Please choose a time.';
      if (!$('consent').checked) e.consent = 'Please tick the box so we can contact you.';
      return e;
    }

    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); k.hideStatus(); FIELDS.forEach(function (id) { k.setErr(id, ''); });
      var errs = check();
      if (Object.keys(errs).length) { k.showErrors(errs, dateEl); k.status('error', 'Please check the highlighted fields.'); return; }
      var body = { name: $('name').value, email: $('email').value, phone: $('phone').value, org: $('org').value, org_type: $('type').value,
        launch: $('time').value, message: $('msg').value, slot: f.querySelector('input[name=slot]:checked').value,
        consent: $('consent').checked, website: $('website').value };
      k.busy(true, 'Booking…');
      send('/api/book', body).then(function (r) {
        var j = r.body;
        if (r.status === 201 && j.ok) {
          var who = body.name.trim(); f.reset(); slotsEl.replaceChildren(hint('Pick a date to see available times.'));
          k.status('ok', 'Thank you, ' + who + '. Your call is booked for ' + j.booking.date_label + ' at ' + j.booking.time_label + ' (East Africa Time). We have emailed you a confirmation. To change the time, call ' + PHONE + '.');
        } else if (r.status === 409) { k.status('error', j.message || 'That time was just taken. Please choose another.'); loadSlots(); }
        else if (r.status === 422 && j.errors) {
          var m = {}; Object.keys(j.errors).forEach(function (key) { m[SERVER_KEY[key] || key] = j.errors[key]; });
          k.showErrors(m, dateEl); k.status('error', j.message || 'Please check the highlighted fields.');
        } else if (r.status === 429) { k.status('error', 'Too many attempts. Please try again later, or call ' + PHONE + '.'); }
        else { k.status('error', 'We could not complete your booking. Please try again, or call ' + PHONE + '.'); }
      }).catch(function () { k.status('error', 'We could not reach our server. Please try again, or call ' + PHONE + '.'); })
        .finally(function () { k.busy(false); });
    });
  }

  // =========================== Telemedicine 101 registration ===========================
  function initRegistration() {
    var f = document.querySelector('#t101-form'); if (!f) return;
    var k = kit(f), $ = k.$;
    var IDS = ['n', 'e', 'p', 'c', 'r', 'o', 't', 'f', 'k2'];
    var SERVER_KEY = { name: 'n', email: 'e', phone: 'p', country: 'c', role: 'r', org: 'o', org_type: 't', format: 'f', consent: 'k2' };
    IDS.forEach(function (id) { $(id).addEventListener('input', function () { k.setErr(id, ''); }); $(id).addEventListener('change', function () { k.setErr(id, ''); }); });

    function check() {
      var e = {}, g = function (id) { return $(id).value.trim(); };
      if (g('n').length < 2) e.n = 'Please enter your full name.';
      if (!EMAIL_RE.test(g('e'))) e.e = 'Please enter a valid email address.';
      if (g('p') && !PHONE_RE.test(g('p'))) e.p = 'Please enter a valid phone number, or leave it blank.';
      if (!$('k2').checked) e.k2 = 'Please tick this box so we can organise the session and contact you.';
      return e;
    }

    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); k.hideStatus(); IDS.forEach(function (id) { k.setErr(id, ''); });
      var errs = check();
      if (Object.keys(errs).length) { k.showErrors(errs); k.status('error', 'Please check the highlighted fields.'); return; }
      var body = { name: $('n').value, email: $('e').value, phone: $('p').value, country: $('c').value, role: $('r').value, org: $('o').value,
        org_type: $('t').value, format: $('f').value, wants_followup: $('k1').checked, consent: $('k2').checked, website: $('website').value };
      k.busy(true, 'Registering…');
      send('/api/t101/register', body).then(function (r) {
        var j = r.body;
        if (r.status === 201 && j.ok) {
          var who = body.name.trim(); var follow = body.wants_followup;
          f.reset();
          k.status('ok', 'Thank you, ' + who + '. You are registered for Telemedicine 101. We will email you the session details as soon as they are confirmed.' + (follow ? ' We will also be in touch about a tailored solution for your organisation.' : ''));
        } else if (r.status === 422 && j.errors) {
          var m = {}; Object.keys(j.errors).forEach(function (key) { m[SERVER_KEY[key] || key] = j.errors[key]; });
          k.showErrors(m); k.status('error', j.message || 'Please check the highlighted fields.');
        } else if (r.status === 429) { k.status('error', 'Too many attempts. Please try again later, or call ' + PHONE + '.'); }
        else { k.status('error', 'We could not complete your registration. Please try again, or call ' + PHONE + '.'); }
      }).catch(function () { k.status('error', 'We could not reach our server. Please try again, or call ' + PHONE + '.'); })
        .finally(function () { k.busy(false); });
    });
  }

  function start() { initBooking(); initRegistration(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
