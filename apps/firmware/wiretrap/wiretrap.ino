/*
 * Rainforest Plant Monitor - ESP32 sensor node
 * Jira: CTIP-17 (readings), CTIP-59 (motion), CTIP-60 (MQTT publishing),
 *       CTIP-62 (camera trigger: tripwire + motion)
 *
 * Telemetry: ONE JSON message per reading to  nodes/{NODE_ID}/telemetry
 * Payload matches TelemetryReadingInput in the OpenAPI contract:
 *   { "ts": "...Z", "temperature": 28.4, "humidity": 91.0,
 *     "soil_moisture": 62, "distance_cm": 45.2, "motion_detected": false }
 *
 * Camera trigger (NOT telemetry, not in the contract):  nodes/{NODE_ID}/trigger
 *   { "ts": "...Z", "source": "tripwire", "deflection": 1520 }
 *   { "ts": "...Z", "source": "motion" }
 * capture.py on the laptop listens to this topic and takes a webcam photo.
 *
 * Libraries (Arduino Library Manager):
 *   - "DHT sensor library" by Adafruit
 *   - "PubSubClient" by Nick O'Leary
 *
 * Put WIFI_SSID, WIFI_PASSWORD, NODE_ID, MQTT_PASSWORD and ROOT_CA in secrets.h (gitignored).
 */
#include <WiFi.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include "DHT.h"
#include "secrets.h"

// ---------- MQTT: team Mosquitto broker on the laptop, TLS + login (CTIP-60, F-14)
// Login: username = NODE_ID, password = MQTT_PASSWORD. ROOT_CA = contents of
// infra/mosquitto/certs/ca.crt. All three are in secrets.h (gitignored).
const char* MQTT_BROKER = "192.168.137.1"; // laptop IP on its hotspot (check with ipconfig)
const int   MQTT_PORT   = 8883;            // TLS only

// ---------- Timing
const unsigned long PUBLISH_INTERVAL_MS = 10000; // normal reading interval
const unsigned long DISTANCE_SAMPLE_MS  = 300;   // motion sampling (CTIP-59)
const unsigned long MOTION_MIN_GAP_MS   = 2000;  // fastest publish after motion
const unsigned long WIFI_TIMEOUT_MS     = 20000;
const unsigned long MQTT_RETRY_MS       = 5000;

// ---------- Motion
const float MOTION_THRESHOLD_CM = 15.0;  // change that counts as motion
const float MAX_VALID_CM        = 400.0; // HC-SR04 range limit

// ---------- Tripwire (joystick with a string tied to the stick, CTIP-62)
const unsigned long TRAP_SAMPLE_MS   = 50;    // check the stick 20 times a second
// ADC reads 0..4095, rest is about 1900, so the biggest possible deflection is about 2000.
const int           TRAP_THRESHOLD   = 1500;  // ADC counts away from rest = pulled (raise = less sensitive)
const int           TRAP_REARM       = 500;   // back within this = stick released
const int           TRAP_CONFIRM     = 4;     // pulled for 4 samples in a row (200 ms)
const bool          TRAP_DEBUG       = true;  // print live stick values; set false when tuned
const unsigned long TRAP_DEBUG_MS    = 250;
const unsigned long TRAP_BLINK_MS     = 150;  // LED on/off speed
const unsigned long TRAP_BLINK_MIN_MS = 3000; // keep blinking at least this long after a pull
const unsigned long TRAP_REARM_MS    = 1000;  // must stay released this long to re-arm
const bool          MOTION_TRIGGERS_CAMERA = true; // HC-SR04 is the second trigger
const unsigned long CAMERA_TRIGGER_GAP_MS  = 5000; // at most one trigger per 5 s

// ---------- Pins
#define DHTPIN          4
#define DHTTYPE         DHT11
#define SOIL_POWER_PIN  25
#define SOIL_ANALOG_PIN 34   // ADC1, safe with Wi-Fi on
#define TRIG_PIN        18
#define ECHO_PIN        19   // through a voltage divider (5 V -> 3.3 V)
#define TRAP_X_PIN      35   // joystick VRx, ADC1, input only
#define TRAP_Y_PIN      32   // joystick VRy, ADC1
#define LED_PIN         5    // LED + 220 ohm resistor to GND
// Joystick VCC goes to 3.3 V, NOT 5 V (5 V would overdrive the ADC pins).

const int SOIL_DRY_RAW = 3800;
const int SOIL_WET_RAW = 1300;

DHT dht(DHTPIN, DHTTYPE);
WiFiClientSecure espClient;   // TLS (was WiFiClient)
PubSubClient mqttClient(espClient);

char topic[96];
char triggerTopic[96];
float lastDistance = -1.0;
bool motionSinceLastPublish = false;
bool ntpStarted = false;
unsigned long lastPublish = 0, lastSample = 0, lastMqttTry = 0;

// Tripwire state
int trapRestX = 0, trapRestY = 0;      // resting position, measured at boot
bool trapArmed = true;
int trapPulledCount = 0;
int lastDeflection = 0;
unsigned long trapReleasedSince = 0, lastTrapSample = 0, lastTrapDebug = 0;
unsigned long trapTriggeredAt = 0, lastBlink = 0;
bool ledOn = false;

// Camera trigger state (sent as soon as MQTT is connected)
bool pendingTrigger = false;
const char* pendingSource = "";
int pendingDeflection = 0;
unsigned long lastTriggerSent = 0;
bool anyTriggerSent = false;

// ---------------------------------------------------------------- Wi-Fi
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("WiFi: connecting to \"%s\"", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nWiFi: OK, IP %s, signal %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    if (!ntpStarted) {
      configTime(0, 0, "pool.ntp.org", "time.google.com"); // UTC
      ntpStarted = true;
    }
  } else {
    Serial.printf("\nWiFi: FAILED (status %d). Check the hotspot is 2.4 GHz "
                  "and the SSID/password are right. Retrying...\n", WiFi.status());
  }
}

// ---------------------------------------------------------------- Time
bool isoNow(char* buf, size_t n) {
  time_t now = time(nullptr);
  if (now < 1700000000) return false; // clock not synced yet
  struct tm t;
  gmtime_r(&now, &t);
  strftime(buf, n, "%Y-%m-%dT%H:%M:%SZ", &t);
  return true;
}

// ---------------------------------------------------------------- MQTT
void connectMQTT() {
  if (mqttClient.connected() || millis() - lastMqttTry < MQTT_RETRY_MS) return;
  lastMqttTry = millis();

  if (time(nullptr) < 1700000000) return;  // wait for NTP time before TLS

  // Client ID and username are both NODE_ID (matches the broker login and acl)
  Serial.printf("MQTT: connecting to %s:%d as %s ... ",
                MQTT_BROKER, MQTT_PORT, NODE_ID);
  if (mqttClient.connect(NODE_ID, NODE_ID, MQTT_PASSWORD)) {
    Serial.println("OK");
  } else {
    // -4 timeout, -2 network or TLS failed, 4 bad username/password, 5 not authorised
    Serial.printf("failed, rc=%d\n", mqttClient.state());
  }
}

// ---------------------------------------------------------------- Sensors
int getSoilMoisturePercent() {
  digitalWrite(SOIL_POWER_PIN, HIGH);
  delay(15);
  int raw = analogRead(SOIL_ANALOG_PIN);
  digitalWrite(SOIL_POWER_PIN, LOW);
  return constrain(map(raw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100), 0, 100);
}

float getDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return -1.0;
  float cm = duration * 0.0343 / 2.0;
  return (cm > MAX_VALID_CM) ? -1.0 : cm;
}

// ---------------------------------------------------------------- Camera trigger
// Queue a trigger. It is sent from loop() once MQTT is connected.
// Rate limited so a shaking wire cannot flood the laptop.
void requestCameraTrigger(const char* source, int deflection) {
  if (anyTriggerSent && millis() - lastTriggerSent < CAMERA_TRIGGER_GAP_MS) {
    Serial.printf("Trigger (%s) ignored: cooldown\n", source);
    return;
  }
  if (pendingTrigger) return; // one already waiting
  pendingTrigger = true;
  pendingSource = source;
  pendingDeflection = deflection;
}

void sendPendingTrigger() {
  if (!pendingTrigger || !mqttClient.connected()) return;

  char json[128];
  char ts[25];
  int n;
  if (isoNow(ts, sizeof(ts))) {
    n = snprintf(json, sizeof(json), "{\"ts\":\"%s\",\"source\":\"%s\"", ts, pendingSource);
  } else {
    n = snprintf(json, sizeof(json), "{\"source\":\"%s\"", pendingSource); // laptop adds the time
  }
  if (strcmp(pendingSource, "tripwire") == 0) {
    n += snprintf(json + n, sizeof(json) - n, ",\"deflection\":%d", pendingDeflection);
  }
  snprintf(json + n, sizeof(json) - n, "}");

  if (mqttClient.publish(triggerTopic, json)) {
    Serial.printf("TRIGGER %s %s\n", triggerTopic, json);
    pendingTrigger = false;
    lastTriggerSent = millis();
    anyTriggerSent = true;
  } else {
    Serial.printf("TRIGGER SEND FAILED %s (will retry)\n", triggerTopic);
  }
}

// ---------------------------------------------------------------- Tripwire
int readAverage(int pin, int samples) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delay(5);
  }
  return sum / samples;
}

void calibrateTrap() {
  trapRestX = readAverage(TRAP_X_PIN, 20);
  trapRestY = readAverage(TRAP_Y_PIN, 20);
  Serial.printf("Tripwire: rest position X=%d Y=%d (leave the wire slack at boot)\n",
                trapRestX, trapRestY);
}

void sampleTrap() {
  int dx = abs(analogRead(TRAP_X_PIN) - trapRestX);
  int dy = abs(analogRead(TRAP_Y_PIN) - trapRestY);
  int deflection = max(dx, dy);
  lastDeflection = deflection;

  if (TRAP_DEBUG && millis() - lastTrapDebug >= TRAP_DEBUG_MS) {
    lastTrapDebug = millis();
    Serial.printf("Trap: dx=%4d dy=%4d deflection=%4d / %d  %s\n",
                  dx, dy, deflection, TRAP_THRESHOLD, trapArmed ? "armed" : "TRIPPED");
  }

  if (trapArmed) {
    if (deflection > TRAP_THRESHOLD) {
      trapPulledCount++;
      if (trapPulledCount >= TRAP_CONFIRM) {
        Serial.println("==================================");
        Serial.printf("   TRIPWIRE PULLED (deflection %d)\n", deflection);
        Serial.println("==================================");
        requestCameraTrigger("tripwire", deflection);
        trapArmed = false;
        trapPulledCount = 0;
        trapReleasedSince = 0;
        trapTriggeredAt = millis();   // updateTrapLed() starts blinking
      }
    } else {
      trapPulledCount = 0; // a single noisy sample does not count
    }
  } else {
    // Re-arm only after the stick has stayed back near rest for a while.
    if (deflection < TRAP_REARM) {
      if (trapReleasedSince == 0) trapReleasedSince = millis();
      if (millis() - trapReleasedSince >= TRAP_REARM_MS) {
        trapArmed = true;
        Serial.println("Tripwire: re-armed");
      }
    } else {
      trapReleasedSince = 0;
    }
  }
}

// Blink while the trap is tripped, and for at least TRAP_BLINK_MIN_MS after a pull.
// Uses millis(), not delay(), so the rest of the code keeps running.
void updateTrapLed() {
  bool blinking = !trapArmed ||
                  (trapTriggeredAt > 0 && millis() - trapTriggeredAt < TRAP_BLINK_MIN_MS);
  if (!blinking) {
    if (ledOn) { ledOn = false; digitalWrite(LED_PIN, LOW); }
    return;
  }
  if (millis() - lastBlink >= TRAP_BLINK_MS) {
    lastBlink = millis();
    ledOn = !ledOn;
    digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
  }
}

void sampleDistance() {
  float d = getDistanceCm();
  if (d < 0) return; // ignore timed-out or out-of-range pings
  if (lastDistance >= 0 && fabs(d - lastDistance) > MOTION_THRESHOLD_CM) {
    motionSinceLastPublish = true;
    Serial.printf("Motion: %.1f -> %.1f cm\n", lastDistance, d);
    if (MOTION_TRIGGERS_CAMERA) requestCameraTrigger("motion", 0);
  }
  lastDistance = d;
}

// ---------------------------------------------------------------- Publish
void publishReading() {
  lastPublish = millis();

  char ts[25];
  if (!isoNow(ts, sizeof(ts))) {
    Serial.println("Skip: clock not synced yet (NTP)");
    return;
  }

  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  int soil = getSoilMoisturePercent();

  char json[256];
  int n = snprintf(json, sizeof(json), "{\"ts\":\"%s\"", ts);
  if (!isnan(temperature)) n += snprintf(json + n, sizeof(json) - n, ",\"temperature\":%.1f", temperature);
  if (!isnan(humidity))    n += snprintf(json + n, sizeof(json) - n, ",\"humidity\":%.1f", humidity);
  n += snprintf(json + n, sizeof(json) - n, ",\"soil_moisture\":%d", soil);
  if (lastDistance >= 0)   n += snprintf(json + n, sizeof(json) - n, ",\"distance_cm\":%.1f", lastDistance);
  snprintf(json + n, sizeof(json) - n, ",\"motion_detected\":%s}",
           motionSinceLastPublish ? "true" : "false");

  if (mqttClient.publish(topic, json)) {
    Serial.printf("SENT %s %s\n", topic, json);
    motionSinceLastPublish = false;
  } else {
    Serial.printf("SEND FAILED %s\n", topic);
  }
}

// ---------------------------------------------------------------- Main
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Rainforest Plant Monitor ===");

  dht.begin();
  pinMode(SOIL_POWER_PIN, OUTPUT);
  digitalWrite(SOIL_POWER_PIN, LOW);
  pinMode(SOIL_ANALOG_PIN, INPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  pinMode(TRAP_X_PIN, INPUT);
  pinMode(TRAP_Y_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);   // without this the pin never drives the LED
  digitalWrite(LED_PIN, LOW);
  calibrateTrap();
  snprintf(topic, sizeof(topic), "nodes/%s/telemetry", NODE_ID);
  snprintf(triggerTopic, sizeof(triggerTopic), "nodes/%s/trigger", NODE_ID);
  Serial.printf("Topic: %s\n", topic);
  Serial.printf("Trigger topic: %s\n", triggerTopic);

  espClient.setCACert(ROOT_CA);   // only trust the team broker's certificate
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setBufferSize(512); // default 256 is tight for JSON
  mqttClient.setKeepAlive(30);

  connectWiFi();
}

void loop() {
  // The tripwire is checked even when Wi-Fi or MQTT is down;
  // the trigger waits in pendingTrigger until it can be sent.
  unsigned long now = millis();
  if (now - lastTrapSample >= TRAP_SAMPLE_MS) {
    lastTrapSample = now;
    sampleTrap();
  }
  updateTrapLed(); // before connectWiFi(), so it blinks even when Wi-Fi is down

  connectWiFi();
  if (WiFi.status() != WL_CONNECTED) return;

  connectMQTT();
  mqttClient.loop(); // never block this with long delay()

  sendPendingTrigger(); // camera trigger goes out first, before telemetry

  now = millis();
  if (now - lastSample >= DISTANCE_SAMPLE_MS) {
    lastSample = now;
    sampleDistance();
  }

  bool due = now - lastPublish >= PUBLISH_INTERVAL_MS;
  bool motionNow = motionSinceLastPublish && now - lastPublish >= MOTION_MIN_GAP_MS;
  if (mqttClient.connected() && (due || motionNow)) publishReading();
}
