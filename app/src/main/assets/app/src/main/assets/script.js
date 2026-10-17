"use strict";

/*
 * WOODE VPN — Android WebView Interface
 * Arabic RTL | Safe native bridge | No simulated VPN connection
 *
 * Android integration contract:
 *   window.AndroidVpn.requestConnect()
 *   window.AndroidVpn.requestDisconnect()
 *
 * Native Android code must report real tunnel state through:
 *   window.WoodeVPN.onNativeState(jsonString)
 *
 * Expected JSON examples:
 *   {"state":"connected","serverName":"My Server","since":1790000000000}
 *   {"state":"disconnected"}
 *   {"state":"connecting"}
 *   {"state":"error","message":"Connection failed"}
 */

(() => {
  const STATES = Object.freeze({
    DISCONNECTED: "disconnected",
    CONNECTING: "connecting",
    CONNECTED: "connected",
    DISCONNECTING: "disconnecting",
    ERROR: "error"
  });

  const $ = (id) => document.getElementById(id);

  const elements = {
    button: $("connectButton"),
    title: $("connectionTitle"),
    status: $("connectionStatus"),
    icon: $("statusIcon"),
    time: $("connectionTime"),
    server: $("serverName"),
    description: $("serverDescription"),
    notice: $("connectionNotice")
  };

  const state = {
    connection: STATES.DISCONNECTED,
    startedAt: null,
    timer: null,
    serverName: "",
    lastError: "",
    nativeAvailable: false
  };

  const messages = {
    [STATES.DISCONNECTED]: {
      title: "غير متصل",
      description: "لم يتم إنشاء اتصال VPN",
      icon: "🔒",
      button: "اتصال VPN",
      notice: "اختر خادمًا صالحًا وأكمل إعداد الاتصال."
    },
    [STATES.CONNECTING]: {
      title: "جارٍ الاتصال",
      description: "بانتظار تأكيد خدمة Android",
      icon: "⏳",
      button: "جارٍ الاتصال...",
      notice: "لا تغلق التطبيق أثناء إنشاء الاتصال."
    },
    [STATES.CONNECTED]: {
      title: "متصل",
      description: "تم تأكيد حالة النفق من Android",
      icon: "🛡️",
      button: "فصل الاتصال",
      notice: "النفق نشط وفق حالة خدمة Android."
    },
    [STATES.DISCONNECTING]: {
      title: "جارٍ الفصل",
      description: "جارٍ إيقاف نفق VPN",
      icon: "⏳",
      button: "جارٍ الفصل...",
      notice: "انتظر حتى تؤكد خدمة Android إيقاف النفق."
    },
    [STATES.ERROR]: {
      title: "تعذّر الاتصال",
      description: "لم يكتمل اتصال VPN",
      icon: "⚠️",
      button: "إعادة المحاولة",
      notice: "تحقق من إعداد الخادم والشبكة وصلاحيات VPN."
    }
  };

  function setText(element, value) {
    if (element) element.textContent = String(value ?? "");
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.max(
      0,
      Math.floor(milliseconds / 1000)
    );

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  }

  function updateTimer() {
    if (!state.startedAt || state.connection !== STATES.CONNECTED) {
      setText(elements.time, "00:00:00");
      return;
    }

    setText(
      elements.time,
      formatDuration(Date.now() - state.startedAt)
    );
  }

  function stopTimer() {
    if (state.timer !== null) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function startTimer() {
    stopTimer();
    updateTimer();

    state.timer = window.setInterval(() => {
      if (state.connection !== STATES.CONNECTED) {
        stopTimer();
        return;
      }

      updateTimer();
    }, 1000);
  }

  function hasNativeBridge() {
    return (
      typeof window.AndroidVpn === "object" &&
      window.AndroidVpn !== null &&
      typeof window.AndroidVpn.requestConnect === "function" &&
      typeof window.AndroidVpn.requestDisconnect === "function"
    );
  }

  function render() {
    const config = messages[state.connection] || messages[STATES.ERROR];

    setText(elements.title, config.title);
    setText(elements.status, config.description);
    setText(elements.icon, config.icon);
    setText(elements.notice, state.lastError || config.notice);

    if (elements.button) {
      const busy =
        state.connection === STATES.CONNECTING ||
        state.connection === STATES.DISCONNECTING;

      elements.button.disabled = busy;
      setText(elements.button, config.button);

      elements.button.setAttribute(
        "aria-busy",
        busy ? "true" : "false"
      );
    }

    if (elements.server) {
      setText(
        elements.server,
        state.serverName || "غير مُعدّ"
      );
    }

    if (elements.description) {
      setText(
        elements.description,
        state.serverName
          ? "الخادم المحدد: " + state.serverName
          : "لم تتم إضافة خادم بعد"
      );
    }

    document.documentElement.dataset.connectionState =
      state.connection;

    if (state.connection !== STATES.CONNECTED) {
      stopTimer();
      setText(elements.time, "00:00:00");
    } else {
      startTimer();
    }
  }

  function transition(nextState, details = {}) {
    if (!Object.values(STATES).includes(nextState)) {
      console.error("WOODE VPN: Invalid native state.");
      return;
    }

    state.connection = nextState;

    if (nextState === STATES.CONNECTED) {
      const suppliedTime = Number(details.since);

      if (
        Number.isFinite(suppliedTime) &&
        suppliedTime > 0 &&
        suppliedTime <= Date.now()
      ) {
        state.startedAt = suppliedTime;
      } else if (!state.startedAt) {
        state.startedAt = Date.now();
      }

      if (typeof details.serverName === "string") {
        state.serverName = details.serverName.slice(0, 100);
      }

      state.lastError = "";
    } else if (
      nextState === STATES.DISCONNECTED ||
      nextState === STATES.ERROR
    ) {
      state.startedAt = null;
    }

    if (nextState === STATES.ERROR) {
      const errorText =
        typeof details.message === "string"
          ? details.message.trim().slice(0, 240)
          : "";

      state.lastError = errorText || messages[STATES.ERROR].notice;
    } else if (nextState === STATES.DISCONNECTED) {
      state.lastError = "";
    }

    render();
  }

  function showBridgeError() {
    transition(STATES.ERROR, {
      message:
        "محرك VPN غير مربوط حتى الآن. يجب تجهيز خدمة Android وخادم WireGuard أولًا."
    });
  }

  function requestConnection() {
    if (!hasNativeBridge()) {
      showBridgeError();
      return;
    }

    if (
      state.connection === STATES.CONNECTING ||
      state.connection === STATES.DISCONNECTING
    ) {
      return;
    }

    if (state.connection === STATES.CONNECTED) {
      requestDisconnection();
      return;
    }

    state.lastError = "";
    transition(STATES.CONNECTING);

    try {
      window.AndroidVpn.requestConnect();
    } catch (error) {
      console.error("WOODE VPN: Native connect request failed.", error);

      transition(STATES.ERROR, {
        message: "تعذّر طلب الاتصال من Android. أعد المحاولة."
      });
    }
  }

  function requestDisconnection() {
    if (!hasNativeBridge()) {
      showBridgeError();
      return;
    }

    transition(STATES.DISCONNECTING);

    try {
      window.AndroidVpn.requestDisconnect();
    } catch (error) {
      console.error("WOODE VPN: Native disconnect request failed.", error);

      transition(STATES.ERROR, {
        message: "تعذّر طلب فصل الاتصال من Android."
      });
    }
  }

  /*
   * Entry point for the Android Kotlin service.
   * Only native code should report verified tunnel states.
   */
  window.WoodeVPN = Object.freeze({
    onNativeState(rawData) {
      let data;

      try {
        data =
          typeof rawData === "string"
            ? JSON.parse(rawData)
            : rawData;
      } catch {
        console.error("WOODE VPN: Invalid native state payload.");
        return;
      }

      if (!data || typeof data !== "object") return;

      const allowedStates = Object.values(STATES);

      if (!allowedStates.includes(data.state)) {
        console.error("WOODE VPN: Unknown native state.");
        return;
      }

      transition(data.state, data);
    },

    getStatus() {
      return Object.freeze({
        state: state.connection,
        serverName: state.serverName,
        connectedSince: state.startedAt
      });
    }
  });

  function initialise() {
    if (elements.button) {
      elements.button.addEventListener("click", requestConnection);
    }

    /*
     * The bridge is unavailable in a normal browser.
     * No fake connection or fabricated IP is displayed.
     */
    state.nativeAvailable = hasNativeBridge();

    transition(STATES.DISCONNECTED);

    if (!state.nativeAvailable) {
      setText(
        elements.notice,
        "واجهة التطبيق جاهزة؛ يلزم ربط محرك VPN الأصلي في Android."
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, {
      once: true
    });
  } else {
    initialise();
  }
})();
