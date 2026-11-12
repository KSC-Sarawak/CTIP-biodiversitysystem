// apps/web/src/sensorState.js
// Shared by the Monitoring page and its parts (components/SensorParts.jsx).

export const has = (v) => v != null && Number.isFinite(Number(v));

// What a node's pin shows: alert (an open alert), online, or offline (any other status).
export const NODE_STATE = {
  alert: { text: "Alert", color: "var(--bad)" },
  online: { text: "Online", color: "var(--ok)" },
  offline: { text: "Offline", color: "var(--neutral, #8a8f87)" },
};
export const nodeState = (node, openAlerts) =>
  openAlerts > 0 ? "alert" : node.status === "active" ? "online" : "offline";
