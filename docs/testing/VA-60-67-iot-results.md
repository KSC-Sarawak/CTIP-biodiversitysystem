# IoT tests (VA-60 to VA-67)

- Date: 12 Nov 2026. Tester: Michelle
- Target: Norman's current IoT files on the `test-iot` branch (commits of 12 Nov, merged with main 354fd36):
  - `apps/firmware/wiretrap/wiretrap.ino`: ESP32 sensor node (DHT11, YL-69, HC-SR04, tripwire)
  - `services/anomaly-detection/Nodegateway.py`: MQTT gateway and laptop webcam capture
  - `infra/mosquitto/mosquitto.conf`, `acl`, `make_certs.py`: the team's own broker on the laptop
  - API routes `POST /telemetry` and `POST /sensor-nodes/{id}/images` (PR #72, live on Render 12 Nov)
- Method: code review of the files above, plus a live run with Norman's real node on 12 Nov (RT-I0). Secret files (`secrets.h`, `bridge_secrets.py`, `passwd`, `certs/`) were not read and are not in git
- Screenshots: `docs/testing/ioT/12nov-api/`

## Data flow now

ESP32 node --MQTT, TLS 8883, own login--> team Mosquitto broker (laptop) --> gateway --HTTPS + X-Sensor-Key--> API (Render) --secret key--> Supabase

The gateway holds no Supabase key. Only the API on Render has it.

## Summary

| Test | Result |
|---|---|
| VA-60 Encryption node, broker, gateway | **Pass (code)**. TLS 1.2+ on 8883 only |
| VA-61 Login per device | **Pass (code)**. No anonymous login; node username = its node ID; gateway has its own login |
| VA-62 Gateway accepts only registered nodes | **Pass (code)** |
| VA-63 Gateway and API check message content | **Pass (code + live)** |
| IoT data through the API (RT-I0) | **Pass (live, 12 Nov)** |
| Live broker refusals (I1) and gateway checks (I2) | To do with Norman |
| VA-64 to VA-67 | Not run |

F-14 and F-15 are fixed in code. Live re-tests I1 and I2 are still to do.

## Results

| Test | What was checked | Expected (pass) | Result | Evidence | Finding |
|---|---|---|---|---|---|
| VA-60 (code) | Encryption between node, broker and gateway | TLS on 8883 only | **Pass**. Broker: only `listener 8883` with `tls_version tlsv1.2`, no 1883 listener. Node: `WiFiClientSecure` with `setCACert(ROOT_CA)` (trusts only the team CA), port 8883. Gateway: `tls_set(ca_certs=ca.crt)`, port 8883, `localhost` | | F-14 |
| VA-61 (code) | Login to the broker | One login per device, no anonymous | **Pass**. `allow_anonymous false`, `password_file passwd`. Node logs in as its `NODE_ID` with its own `MQTT_PASSWORD`; the gateway uses its own `gateway` login. ACL: each node may only write `nodes/<own id>/telemetry` and `/trigger`; only the gateway may read them | | F-14 |
| VA-62 (code) | Gateway accepts only registered nodes | Unknown node IDs ignored | **Pass**. `known_node()` checks the UUID format and the `REGISTERED_NODES` list before anything else; others are logged and dropped. The API also refuses unknown or retired nodes (404) | | F-15 |
| VA-63 (code) | Gateway and API check the message | Bad values refused | **Pass**. Gateway: only contract fields kept, `ts` must be a date-time, range checks (`SENSOR_LIMITS`), trigger `source` only `motion`/`tripwire` (else `unknown`), photo file name built from safe characters only and checked to stay in its folder, 5 s cooldown per node plus at most 6 photos per minute in total. API (PR #72): unknown fields, out-of-range values and non-JPEG or over-2-MB photos refused (422/415/413) | | F-15 |
| RT-I0a (live) | `POST /v1/telemetry` on Render with no key | 401 | **Pass**. 401 "Missing or wrong X-Sensor-Key" | `RT-I0-api-telemetry-401.png` | |
| RT-I0b (live) | Norman's real node through broker, gateway and API | Readings saved, photo 201 | **Pass**. `saved {...}` lines and `uploaded ... (HTTP 201)` | `RT-I0b-gateway-api-saved.jpeg` | |
| RT-I0c (live) | Live website Monitoring page | New readings and photos shown | **Pass**. Photos 12 Nov 4:49 to 4:50 pm | `RT-I0c-dashboard-new-reading.png` (faces blurred) | |
| I1 (live, to do) | Broker refuses port 1883, a wrong password, and a node writing to another node's topic | All refused | To do with Norman | | F-14 |
| I2 (live, to do) | Gateway drops an out-of-range reading and a trigger from an unregistered node | Dropped and logged | To do with Norman | | F-15 |
| VA-64 to VA-67 | Replay, flooding, node-silent alert, device keys | | Not run (out of time for Sprint 2) | | |

## Notes

- **Certificates:** the old broker certificate keys are in the history of Norman's IoT-AI repository. Norman is to make new certificates with `make_certs.py` (new CA) before the real re-test (see F-14 in the main report). MQTT passwords were changed on 10 Nov.
- **Sensor key:** one `SENSOR_KEY` for the gateway, kept in `bridge_secrets.py` (gitignored) and on Render only. It was replaced on 12 Nov after it was put in the node ID field by mistake.
- **Supabase mode still in the gateway:** `MODE = "supabase"` and `SUPABASE_SERVICE_KEY` are still supported as a fallback. The gateway has no Supabase key (legacy keys are off and no `iot-gateway` key was made), so this mode cannot work. Recommend removing it so no one puts a Supabase key back on the laptop.
- **Broker on the laptop hotspot:** reachable only on the hotspot network. Port 8883 must not be opened to the internet.
- **Before (4 Nov review of Norman's first files):** public `broker.hivemq.com:1883` with no TLS and no login (F-14, High) and no checks on trigger text or node IDs (F-15, Medium). Details and evidence are in the main report and `ioT/3nov-testing/`, `ioT/4nov-testing/`.
