(function () {
  "use strict";

  var REFERRER_PARAM = "referrer";
  var LEGACY_PARAMS = ["attribution"];
  var STORAGE_KEY = "bgenerous.partnerReferrer.v1";
  var config = window.BGenerousWordPressConfig || {};
  var fallbackStorage = createMemoryStorage();
  var storageDriver = resolveStorageDriver();
  var trackedFormSelector = config.trackedFormSelector || [
    "form[data-bgenerous-referral-form]",
    "form.wpforms-form",
    "form.wpcf7-form",
    ".gform_wrapper form",
    "form.elementor-form"
  ].join(", ");
  var hiddenFieldNames = {
    referrerCode: config.referrerFieldName || "bgenerous_referrer_code",
    brokerCompanyName: config.brokerCompanyFieldName || "bgenerous_broker_company_name",
    brokerSource: config.brokerSourceFieldName || "bgenerous_broker_source"
  };

  function toArray(value) {
    return Array.prototype.slice.call(value || []);
  }

  function first(selector, context) {
    return (context || document).querySelector(selector);
  }

  function each(selector, callback, context) {
    toArray((context || document).querySelectorAll(selector)).forEach(callback);
  }

  function createMemoryStorage() {
    var memory = {};

    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
      },
      setItem: function (key, value) {
        memory[key] = String(value);
      },
      removeItem: function (key) {
        delete memory[key];
      }
    };
  }

  function createStorageDriver(kind) {
    try {
      var storage = window[kind];
      if (!storage) {
        return null;
      }

      var probeKey = STORAGE_KEY + ".probe";
      storage.setItem(probeKey, "1");
      storage.removeItem(probeKey);

      return {
        getItem: function (key) {
          return storage.getItem(key);
        },
        setItem: function (key, value) {
          storage.setItem(key, value);
        },
        removeItem: function (key) {
          storage.removeItem(key);
        }
      };
    } catch (error) {
      return null;
    }
  }

  function resolveStorageDriver() {
    return createStorageDriver("localStorage") || createStorageDriver("sessionStorage") || fallbackStorage;
  }

  function normalizeReferrer(value) {
    return value ? String(value).trim().toUpperCase() : "";
  }

  function readStoredReferrer() {
    var raw = storageDriver.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      var parsed = JSON.parse(raw);
      return normalizeReferrer(parsed.referrerCode);
    } catch (error) {
      storageDriver.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function writeStoredReferrer(referrerCode) {
    var normalized = normalizeReferrer(referrerCode);
    if (!normalized) {
      return;
    }

    storageDriver.setItem(STORAGE_KEY, JSON.stringify({
      referrerCode: normalized,
      capturedAt: new Date().toISOString()
    }));
  }

  function clearStoredReferrer() {
    storageDriver.removeItem(STORAGE_KEY);
  }

  function brokerInitials(name) {
    var tokens = String(name || "")
      .trim()
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .slice(0, 2);

    if (!tokens.length) {
      return "BG";
    }

    return tokens.map(function (token) {
      return token.charAt(0).toUpperCase();
    }).join("");
  }

  function minimalState(referrerCode) {
    return {
      referrerCode: normalizeReferrer(referrerCode),
      companyName: "",
      description: "",
      logoUrl: "",
      source: "referrer-only"
    };
  }

  async function fetchBroker(referrerCode) {
    var endpoint = config.brokerEndpoint || "/wp-json/bgenerous/v1/broker";
    var url = new URL(endpoint, window.location.origin);
    url.searchParams.set("referrer", normalizeReferrer(referrerCode));

    var response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    });

    var payload = {};

    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok || !payload.ok) {
      var requestError = new Error(payload.message || "Unable to resolve broker.");
      requestError.statusCode = response.status;
      throw requestError;
    }

    return payload.broker;
  }

  function getFormField(form, name) {
    return toArray(form.elements || []).find(function (field) {
      return field && field.name === name;
    }) || null;
  }

  function setHiddenField(form, name, value) {
    var field = getFormField(form, name);

    if (!field) {
      field = document.createElement("input");
      field.type = "hidden";
      field.name = name;
      form.appendChild(field);
    }

    field.value = value;
  }

  function syncTrackedForms(state) {
    var referrerValue = state ? (state.referrerCode || "") : "";
    var companyValue = state ? (state.companyName || "") : "";
    var sourceValue = state ? (state.source || "") : "";

    each(trackedFormSelector, function (form) {
      setHiddenField(form, hiddenFieldNames.referrerCode, referrerValue);
      setHiddenField(form, hiddenFieldNames.brokerCompanyName, companyValue);
      setHiddenField(form, hiddenFieldNames.brokerSource, sourceValue);
    });
  }

  function renderBanner(state) {
    each("[data-bgenerous-broker-banner]", function (banner) {
      var logo = first("[data-bgenerous-broker-logo]", banner);
      var initials = first("[data-bgenerous-broker-initials]", banner);
      var name = first("[data-bgenerous-broker-name]", banner);
      var description = first("[data-bgenerous-broker-description]", banner);

      if (!state) {
        banner.hidden = true;
        return;
      }

      if (name) {
        name.textContent = state.companyName || "BGenerous Referral Partner";
      }

      if (description) {
        description.textContent = state.description || "";
      }

      if (initials) {
        initials.textContent = brokerInitials(state.companyName);
        initials.hidden = !!state.logoUrl;
      }

      if (logo) {
        if (state.logoUrl) {
          logo.src = state.logoUrl;
          logo.alt = (state.companyName || "Broker") + " logo";
          logo.hidden = false;
        } else {
          logo.hidden = true;
        }
      }

      banner.hidden = false;
    });
  }

  function removeLegacyParams(url) {
    LEGACY_PARAMS.forEach(function (key) {
      url.searchParams.delete(key);
    });
  }

  function cleanLocation(url) {
    removeLegacyParams(url);
    url.searchParams.delete(REFERRER_PARAM);
    window.location.replace(url.pathname + url.search + url.hash);
  }

  function publishState(state) {
    document.dispatchEvent(new CustomEvent("bgenerous:referral-change", {
      detail: state
    }));
  }

  async function bootstrap() {
    var url = new URL(window.location.href);
    var incomingReferrer = normalizeReferrer(url.searchParams.get(REFERRER_PARAM));
    var storedReferrer = readStoredReferrer();

    if (incomingReferrer) {
      if (!storedReferrer) {
        writeStoredReferrer(incomingReferrer);
      }

      cleanLocation(url);
      return;
    }

    if (!storedReferrer) {
      syncTrackedForms(null);
      renderBanner(null);
      publishState(null);
      return;
    }

    syncTrackedForms(minimalState(storedReferrer));

    try {
      var broker = await fetchBroker(storedReferrer);
      var state = {
        referrerCode: normalizeReferrer(broker.referrerCode || storedReferrer),
        companyName: broker.companyName || "",
        description: broker.description || "",
        logoUrl: broker.logoUrl || "",
        source: broker.source || "softr-tables-api"
      };

      syncTrackedForms(state);
      renderBanner(state);
      publishState(state);
    } catch (error) {
      if (error && error.statusCode === 404) {
        clearStoredReferrer();
        syncTrackedForms(null);
        renderBanner(null);
        publishState(null);
        return;
      }

      syncTrackedForms(minimalState(storedReferrer));
      renderBanner(null);
    }
  }

  window.BGenerousReferral = {
    getStoredReferrer: readStoredReferrer,
    clear: function () {
      clearStoredReferrer();
      syncTrackedForms(null);
      renderBanner(null);
      publishState(null);
    }
  };

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
