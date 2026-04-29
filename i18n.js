/**
 * i18n.js – Internationalisation engine for Dipartimento di Ingegneria LUM
 *
 * Language detection priority:
 *   1. URL parameter  ?lang=en
 *   2. localStorage   key "lum-lang"
 *   3. Browser locale navigator.language
 *   4. Default        "it"
 *
 * Public API (global):
 *   setLanguage(lang)  – switch language, update DOM, URL, localStorage, Botpress
 */

(function () {
  'use strict';

  /* ── Constants ──────────────────────────────────────────────── */
  var SUPPORTED = ['it', 'en'];
  var DEFAULT_LANG = 'it';
  var STORAGE_KEY = 'lum-lang';
  var TRANSLATIONS_URL = 'translations.json';

  /* ── In-memory cache ─────────────────────────────────────────── */
  var _cache = null;      // full translations JSON
  var _current = null;    // currently active language strings

  /* ── Language detection ─────────────────────────────────────── */
  function detectLang() {
    // 1. URL parameter
    var urlParam = new URLSearchParams(window.location.search).get('lang');
    if (urlParam && SUPPORTED.indexOf(urlParam.toLowerCase()) !== -1) {
      return urlParam.toLowerCase();
    }
    // 2. localStorage
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.indexOf(stored) !== -1) {
      return stored;
    }
    // 3. Browser language
    var browserLang = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
    if (SUPPORTED.indexOf(browserLang) !== -1) {
      return browserLang;
    }
    // 4. Default
    return DEFAULT_LANG;
  }

  /* ── Deep-get a nested key like "hero.btnChat" ───────────────── */
  function get(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o && o[k] !== undefined) ? o[k] : null;
    }, obj);
  }

  /* ── Apply translations to the DOM ─────────────────────────── */
  function applyTranslations(t) {
    // Text content
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var value = get(t, key);
      if (value !== null) {
        el.textContent = value;
      }
    });

    // Inner HTML (for elements containing <br>, <strong>, etc.)
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      var value = get(t, key);
      if (value !== null) {
        el.innerHTML = value;
      }
    });

    // Attributes (title, aria-label, placeholder, alt …)
    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      var map;
      try {
        map = JSON.parse(el.getAttribute('data-i18n-attr'));
      } catch (e) {
        return;
      }
      Object.keys(map).forEach(function (attr) {
        var value = get(t, map[attr]);
        if (value !== null) {
          el.setAttribute(attr, value);
        }
      });
    });

    // Href (for links that point to locale-specific URLs)
    document.querySelectorAll('[data-i18n-href]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-href');
      var value = get(t, key);
      if (value !== null) {
        el.setAttribute('href', value);
      }
    });
  }

  /* ── Update active lang button state ─────────────────────────── */
  function updateLangButtons(lang) {
    document.querySelectorAll('.lang-switch').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
      btn.setAttribute('aria-current', btn.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
  }

  /* ── Update SOCIAL_DATA if it exists on window ───────────────── */
  function updateSocialData(t) {
    if (typeof window.SOCIAL_DATA === 'undefined' || !t.socialData) {
      return;
    }
    Object.keys(t.socialData).forEach(function (key) {
      if (window.SOCIAL_DATA[key]) {
        var src = t.socialData[key];
        if (src.name)  { window.SOCIAL_DATA[key].name  = src.name; }
        if (src.desc)  { window.SOCIAL_DATA[key].desc  = src.desc; }
        if (src.meta)  { window.SOCIAL_DATA[key].meta  = src.meta; }
        if (src.note)  { window.SOCIAL_DATA[key].note  = src.note; }
        if (src.cta)   { window.SOCIAL_DATA[key].cta   = src.cta; }
      }
    });
  }

  /* ── Notify Botpress of language change ─────────────────────── */
  function notifyBotpress(lang) {
    try {
      if (window.botpressWebChat && typeof window.botpressWebChat.sendEvent === 'function') {
        window.botpressWebChat.sendEvent({
          type: 'SET_LANGUAGE',
          payload: { language: lang }
        });
      }
    } catch (e) {
      // Botpress not available yet – silently ignore
    }
  }

  /* ── Fade helpers ───────────────────────────────────────────── */
  function fadeOut(cb) {
    document.body.classList.add('i18n-transitioning');
    setTimeout(cb, 150);
  }

  function fadeIn() {
    document.body.classList.remove('i18n-transitioning');
  }

  /* ── Core: load JSON (once) then apply ──────────────────────── */
  function loadAndApply(lang, cb) {
    if (_cache) {
      _current = _cache[lang] || _cache[DEFAULT_LANG];
      if (typeof cb === 'function') { cb(); }
      return;
    }
    fetch(TRANSLATIONS_URL)
      .then(function (res) {
        if (!res.ok) { throw new Error('Failed to load ' + TRANSLATIONS_URL); }
        return res.json();
      })
      .then(function (data) {
        _cache = data;
        _current = data[lang] || data[DEFAULT_LANG];
        if (typeof cb === 'function') { cb(); }
      })
      .catch(function (err) {
        console.warn('[i18n] Could not load translations:', err);
      });
  }

  /* ── Public: setLanguage ──────────────────────────────────────── */
  function setLanguage(lang) {
    lang = lang && SUPPORTED.indexOf(lang.toLowerCase()) !== -1
      ? lang.toLowerCase()
      : DEFAULT_LANG;

    fadeOut(function () {
      loadAndApply(lang, function () {
        applyTranslations(_current);
        updateSocialData(_current);

        // Update <html lang="">
        document.documentElement.setAttribute('lang', lang);

        // Update <title> and meta description
        if (_current.meta) {
          if (_current.meta.title) {
            document.title = _current.meta.title;
          }
          var metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc && _current.meta.description) {
            metaDesc.setAttribute('content', _current.meta.description);
          }
        }

        // Update URL without reload
        var url = new URL(window.location.href);
        url.searchParams.set('lang', lang);
        window.history.pushState({ lang: lang }, '', url.toString());

        // Persist choice
        localStorage.setItem(STORAGE_KEY, lang);

        // Update button states
        updateLangButtons(lang);

        // Notify Botpress
        notifyBotpress(lang);

        fadeIn();
      });
    });
  }

  /* ── Bind lang-switch buttons ─────────────────────────────────── */
  function bindButtons() {
    document.querySelectorAll('.lang-switch').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setLanguage(btn.getAttribute('data-lang'));
      });
    });
  }

  /* ── Handle browser back/forward (popstate) ───────────────────── */
  window.addEventListener('popstate', function (e) {
    var lang = (e.state && e.state.lang) ||
      new URLSearchParams(window.location.search).get('lang') ||
      DEFAULT_LANG;
    setLanguage(lang);
  });

  /* ── Init on DOM ready ─────────────────────────────────────────── */
  function init() {
    var lang = detectLang();
    bindButtons();

    // Only apply translations when a non-default language is detected,
    // or always apply to ensure DOM attributes stay consistent.
    loadAndApply(lang, function () {
      applyTranslations(_current);
      updateSocialData(_current);
      document.documentElement.setAttribute('lang', lang);
      if (_current.meta) {
        if (_current.meta.title) { document.title = _current.meta.title; }
        var metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && _current.meta.description) {
          metaDesc.setAttribute('content', _current.meta.description);
        }
      }
      var url = new URL(window.location.href);
      url.searchParams.set('lang', lang);
      window.history.replaceState({ lang: lang }, '', url.toString());
      localStorage.setItem(STORAGE_KEY, lang);
      updateLangButtons(lang);
      notifyBotpress(lang);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Expose globally ─────────────────────────────────────────── */
  window.setLanguage = setLanguage;

}());
