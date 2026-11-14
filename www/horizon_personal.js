/* Two small visual preferences. No new panels, network calls, animations or message rewrites. */
(function () {
  'use strict';
  var groups = {
    surface: { title: 'Chat surface', values: [['original','Original dots'],['plain','Plain'],['grid','Blueprint grid'],['lines','Notebook lines'],['halo','Soft halo']] },
    spacing: { title: 'Message spacing', values: [['original','Original'],['compact','Compact'],['balanced','Balanced'],['roomy','Roomy'],['reading','Reading room']] }
  };
  function saved(key) { var val; try { val = localStorage.getItem('horizon_visual_' + key); } catch (_) {} return groups[key].values.some(function (v) { return v[0] === val; }) ? val : 'original'; }
  function apply(key, val) {
    if (!groups[key] || !groups[key].values.some(function (v) { return v[0] === val; })) return;
    document.documentElement.setAttribute('data-hz-' + key, val);
    document.querySelectorAll('[data-hz-visual="' + key + '"]').forEach(function (b) {
      var selected = b.dataset.value === val;
      b.setAttribute('aria-checked', String(selected)); b.tabIndex = selected ? 0 : -1;
    });
  }
  Object.keys(groups).forEach(function (key) { apply(key, saved(key)); });
  function mount() {
    var host = document.querySelector('.tab-body[data-tab="personalisation"]');
    if (!host || document.getElementById('hzVisualPrefs')) return;
    var section = document.createElement('section'); section.id = 'hzVisualPrefs'; section.className = 'provider-card hz-visual-prefs';
    var title = document.createElement('h3'); title.textContent = 'Chat appearance'; section.appendChild(title);
    var note = document.createElement('p'); note.textContent = 'Preview below. Applies instantly, stays on this device. Original restores the existing look.'; section.appendChild(note);
    Object.keys(groups).forEach(function (key) {
      var field = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = groups[key].title;
      field.appendChild(legend); field.setAttribute('role', 'radiogroup'); field.setAttribute('aria-label', groups[key].title);
      groups[key].values.forEach(function (v) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'hz-visual-option'; b.dataset.hzVisual = key; b.dataset.value = v[0]; b.setAttribute('role', 'radio');
        var swatch = document.createElement('span'); swatch.className = 'hz-visual-swatch'; swatch.dataset.preview = key + '-' + v[0]; swatch.setAttribute('aria-hidden','true');
        b.appendChild(swatch); b.appendChild(document.createTextNode(v[1]));
        function choose() { try { localStorage.setItem('horizon_visual_' + key, v[0]); } catch (_) {} apply(key, v[0]); }
        b.addEventListener('click', choose);
        b.addEventListener('keydown', function (e) {
          var buttons = Array.from(field.querySelectorAll('button')), at = buttons.indexOf(b), next;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (at+1)%buttons.length;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (at+buttons.length-1)%buttons.length;
          if (e.key === 'Home') next = 0; if (e.key === 'End') next = buttons.length-1;
          if (next != null) { e.preventDefault(); buttons[next].click(); buttons[next].focus(); }
        }); field.appendChild(b);
      }); section.appendChild(field);
    });
    var theme = document.getElementById('themeCard');
    if (theme) theme.insertAdjacentElement('afterend',section); else host.appendChild(section);
    Object.keys(groups).forEach(function (key) { apply(key,saved(key)); });
  }
  window.HorizonPersonal = { mount: mount, apply: apply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
