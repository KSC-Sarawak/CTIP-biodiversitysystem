# IoT Runbook: Mosquitto Broker + Gateway + ESP32 (TLS)

**Jira:** CTIP-60 (MQTT/TLS), CTIP-61 (bridge), CTIP-62 (webcam). **Security:** F-14, F-15.
**Status 8 Nov 2026:** working on the laptop with the real ESP32.

```
ESP32 (wiretrap.ino) --TLS 8883, login = node UUID--> Mosquitto (laptop, 192.168.137.1)
                                                            |
Nodegateway.py (same laptop) <--TLS 8883, login = gateway---'
   nodes/{id}/telemetry -> Supabase telemetry table
   nodes/{id}/trigger   -> webcam photo -> Supabase sensor-images bucket
```

- No public broker. broker.hivemq.com is no longer used anywhere.
- Each node can only publish to `nodes/<its own UUID>/telemetry` and `/trigger` (Michelle's `acl`).
- The gateway can only read those topics.
- HiveMQ Cloud free (Serverless) was retired, so the team runs its own Mosquitto.

---

## 1. Where everything lives

| File | Repo / folder | Committed? |
|---|---|---|
| `mosquitto.conf`, `acl` | team repo `CTIP-biodiversitysystem/infra/mosquitto/` | Yes (Michelle's, unchanged) |
| `make_certs.py` | same folder | Yes (no secrets) |
| `passwd` | same folder | **No** (logins) |
| `certs/ca.crt`, `ca.key`, `server.crt`, `server.key` | same folder, **inside `certs\`** | **No** |
| `Nodegateway.py` | team repo `services/anomaly-detection/` | Yes |
| `bridge_secrets.py` | `services/anomaly-detection/` | **No** (Supabase key, gateway MQTT password) |
| `ca.crt` (copy) | `services/anomaly-detection/` | **No** |
| `wiretrap.ino` | team repo `apps/firmware/wiretrap/` | Yes |
| `secrets.h` | `apps/firmware/wiretrap/` | **No** (Wi-Fi, NODE_ID, node MQTT password, ROOT_CA) |

The `.gitignore` in the top folder of the team repo must contain:
```
bridge_secrets.py
secrets.h
/captures
__pycache__/
*.pyc
ca.crt
```
`infra/mosquitto/.gitignore` already ignores `passwd` and `certs/`.

## 2. Values used

| Name | Value |
|---|---|
| Hotspot | `DESKTOP-FCAD7GL`, 2.4 GHz |
| Laptop IP on hotspot | `192.168.137.1` (check with `ipconfig`) |
| Broker port | `8883` (TLS only, no 1883) |
| Node UUID | `0ac66bdc-db55-4a8e-a7c6-4c30daa8124b` (= `NODE_ID` = `sensor_nodes.id` = MQTT username) |
| Gateway MQTT username | `gateway` |
| Passwords | in a password manager only |

---

## 3. One-time setup (laptop)

Run everything in **PowerShell**. Steps marked **(Admin)** need "Run as Administrator".

### 3.1 Install Mosquitto
1. Download the Windows 64-bit installer from mosquitto.org/download and finish it.
2. Find where it installed:
   ```powershell
   Get-ChildItem "C:\Program Files","C:\Program Files (x86)" -Filter mosquitto.exe -Recurse -ErrorAction SilentlyContinue | Select-Object FullName
   ```
3. Set `$M` to that folder (without `\mosquitto.exe`). **Do this in every new PowerShell window.**
   ```powershell
   $M = "C:\Program Files\mosquitto"
   Test-Path "$M\mosquitto.exe"     # must print True
   ```
4. **(Admin)** Turn off the default Mosquitto service, so only the team config runs:
   ```powershell
   Stop-Service mosquitto
   Set-Service mosquitto -StartupType Disabled
   ```

### 3.2 Get the team repo
```powershell
git clone https://github.com/Kampung-Semua-Cina/CTIP-biodiversitysystem
cd CTIP-biodiversitysystem\infra\mosquitto
```
(Already cloned: `git pull` on `main`.) `make_certs.py` is already in this folder.

### 3.3 Certificates
From `infra\mosquitto`, with Python available:
```powershell
python -m pip install cryptography
python make_certs.py 192.168.137.1
Get-ChildItem certs     # must list ca.crt, ca.key, server.crt, server.key
```
- Files land in `certs\` automatically. Do not move them out. Mosquitto looks for `certs/ca.crt`.
- If the hotspot IP changes: run `python make_certs.py <new IP>` again from this folder and restart Mosquitto. The CA is reused, so the ESP32 does not need a new `ROOT_CA`. Only `MQTT_BROKER` in `wiretrap.ino` changes.

### 3.4 Logins
From `infra\mosquitto`. Each command asks for the password twice.
```powershell
& "$M\mosquitto_passwd.exe" -c passwd gateway
& "$M\mosquitto_passwd.exe" passwd 0ac66bdc-db55-4a8e-a7c6-4c30daa8124b
Test-Path passwd     # must print True
```
- **Only the first command has `-c`.** `-c` wipes the file.
- Reset a forgotten password: run the second form (no `-c`) with that username, then restart Mosquitto.

### 3.5 Firewall **(Admin)**
Allow the hotspot to reach port 8883:
```powershell
New-NetFirewallRule -DisplayName "Mosquitto MQTT TLS (hotspot only)" -Direction Inbound -Protocol TCP -LocalPort 8883 -RemoteAddress 192.168.137.0/24 -Action Allow
```
Remove any **Block** rules Windows made if its popup was cancelled (Block beats Allow):
```powershell
Get-NetFirewallApplicationFilter -Program "*mosquitto*" | Get-NetFirewallRule | Select-Object DisplayName, Action, Enabled, Profile
Get-NetFirewallApplicationFilter -Program "*mosquitto*" | Get-NetFirewallRule | Where-Object Action -eq Block | Remove-NetFirewallRule
```

### 3.6 Gateway config (`services\anomaly-detection\`)
1. Copy the CA next to the gateway:
   ```powershell
   Copy-Item <team repo>\infra\mosquitto\certs\ca.crt <team repo>\services\anomaly-detection\
   ```
2. `Nodegateway.py` settings (top of file):
   ```python
   USE_TEAM_BROKER = True
   BROKER = "localhost"
   PORT = 8883
   REGISTERED_NODES = {
       "0ac66bdc-db55-4a8e-a7c6-4c30daa8124b",
   }
   ```
3. `bridge_secrets.py`:
   ```python
   SUPABASE_SERVICE_KEY = "..."
   SENSOR_KEY = "..."
   MQTT_USER = "gateway"
   MQTT_PASSWORD = "..."
   ```
4. Python packages (once, in the `.venv`):
   ```powershell
   .venv\Scripts\Activate.ps1
   pip install opencv-python paho-mqtt requests
   ```

### 3.7 ESP32 config
1. `wiretrap.ino`:
   ```cpp
   const char* MQTT_BROKER = "192.168.137.1";
   const int   MQTT_PORT   = 8883;
   ```
2. `secrets.h`:
   ```cpp
   const char* WIFI_SSID     = "DESKTOP-FCAD7GL";
   const char* WIFI_PASSWORD = "...";
   const char* NODE_ID       = "0ac66bdc-db55-4a8e-a7c6-4c30daa8124b";
   const char* MQTT_PASSWORD = "...";
   static const char ROOT_CA[] = R"EOF(
   -----BEGIN CERTIFICATE-----
   ...full contents of infra\mosquitto\certs\ca.crt...
   -----END CERTIFICATE-----
   )EOF";
   ```
3. Upload with Arduino IDE. Serial Monitor at 115200.

---

## 4. Every session (in this order)

| # | What | Command | Expected |
|---|---|---|---|
| 1 | Hotspot on | Windows Settings | `DESKTOP-FCAD7GL`, 2.4 GHz |
| 2 | Broker (window 1) | `$M = "C:\Program Files\mosquitto"`<br>`cd <team repo>\infra\mosquitto`<br>`& "$M\mosquitto.exe" -c mosquitto.conf -v` | `Opening ipv4 listen socket on port 8883.` and it stays running |
| 3 | Gateway (window 2) | `cd <team repo>\services\anomaly-detection`<br>`.venv\Scripts\Activate.ps1`<br>`python Nodegateway.py` | `[MQTT] connected to localhost, listening on ...` |
| 4 | ESP32 | Power on | Serial: `WiFi: OK, IP 192.168.137.x` then `MQTT: connecting to 192.168.137.1:8883 as <UUID> ... OK` |

Working state: Mosquitto shows `New connection from 192.168.137.x`, the gateway prints `[TELEMETRY] <UUID> saved {...}` every interval, and a wire tug prints `TRIGGER from ...` with a photo in `captures\uploaded\`.

Stop: Ctrl+C in each window.

Gateway flags: `--no-camera` (telemetry only), `--test` (one test photo, then exit).

---

## 5. Tests

### 5.1 Broker + gateway without the ESP32 (window 3)
```powershell
$M = "C:\Program Files\mosquitto"
cd <team repo>\infra\mosquitto
& "$M\mosquitto_pub.exe" --% -h 192.168.137.1 -p 8883 --cafile certs\ca.crt -u 0ac66bdc-db55-4a8e-a7c6-4c30daa8124b -P NODE-PASSWORD -t nodes/0ac66bdc-db55-4a8e-a7c6-4c30daa8124b/telemetry -m "{\"ts\":\"2026-11-08T06:00:00Z\",\"temperature\":28.5,\"humidity\":80,\"soil_moisture\":40,\"distance_cm\":100,\"motion_detected\":false}"
```
Expected in the gateway: `[TELEMETRY] 0ac66bdc-... saved {...}`. Passed on 8 Nov.

This runs on the laptop itself, so it does **not** test the firewall. The ESP32 does.

### 5.2 Security re-test (Michelle, F-14 / F-15)
| Test | Expected |
|---|---|
| Node publishes to its own topic | Accepted, gateway prints `saved` |
| Node publishes to another node's topic | Dropped by broker, gateway never sees it |
| Node subscribes to `nodes/#` | Receives nothing |
| Wrong password or no login | `Connection refused` |
| Port 1883 | `Connection refused` (no listener) |
| `temperature` 9999 | Gateway: `skipped, temperature=9999 is outside -10..60` |
| Trigger `source` not `motion`/`tripwire` | Gateway skips it |

All of these passed in Claude's Linux test with the same config on 8 Nov.

---

## 6. PowerShell rules (these caused most errors on 8 Nov)

1. **Never paste the prompt.** Copy only the command, not `PS C:\Users\User>`.
2. **Start with `& `** when running a program from a quoted path: `& "$M\mosquitto_pub.exe" ...`. Without `&`, PowerShell treats the path as text.
3. **Set `$M` in every new window.** An empty `$M` gives `'\mosquitto_pub.exe' is not recognized`.
4. **Be in the right folder.** Mosquitto and `mosquitto_pub` use relative paths (`mosquitto.conf`, `passwd`, `certs\ca.crt`). Check with `Get-Location` and `Get-ChildItem`.
5. **No `< >` around values.** Type the real UUID; `<` is special in PowerShell.
6. **Use `--%` before arguments that contain JSON**, so the quotes reach the program unchanged.
7. **Hidden `.txt` extensions:** if you see `mosquitto.conf.txt` or `passwd.txt`, run `Rename-Item <name>.txt <name>`.

---

## 7. Troubleshooting (real errors from 8 Nov first)

| Error | Cause | Fix |
|---|---|---|
| `'C:\Program Files\mosquitto\mosquitto.exe' is not recognized` | Installed elsewhere or not installed | 3.1 step 2, set `$M` to the found folder |
| `Error: Unable to open config file 'mosquitto.conf'` | Wrong folder, or team repo not on laptop | `cd <team repo>\infra\mosquitto` (3.2) |
| `password-file: Error: Unable to open pwfile "passwd"` | Logins not made in this folder | 3.4 from `infra\mosquitto` |
| `Unable to load CA certificates. Check cafile "certs/ca.crt"` ... `no such file` | Cert files loose in `infra\mosquitto` instead of `certs\` | `New-Item -ItemType Directory certs -Force; Move-Item ca.crt, ca.key, server.crt, server.key certs\` |
| `The ampersand (&) character is not allowed` | Pasted `PS C:\...>` before `&` | Rule 1 |
| `Unexpected token '-p'` | Missing `&` at the start | Rule 2 |
| `'\mosquitto_pub.exe' is not recognized` | `$M` empty in this window | Rule 3 |
| `Unable to read file "test.json": Invalid input` | Test file problem | Use the `--%` command in 5.1 (no file) |
| ESP32 `rc=-2`, nothing in Mosquitto log | ESP32 never reached the laptop: firewall | 3.5 (Allow rule, remove Block rules). Check the ESP32 IP is `192.168.137.x` |
| ESP32 `rc=-2`, Mosquitto shows `New connection` then an OpenSSL error | TLS failed | `ROOT_CA` must be the full, current `certs\ca.crt`; `server.crt` must include the IP (rerun 3.3, restart broker) |
| ESP32 `rc=4` or `rc=5` | Wrong node username or password | Username = full UUID; reset with 3.4 |
| ESP32 silent after `WiFi: OK` | Waiting for NTP time | Laptop needs internet; wait up to 30 s |
| Gateway `connect failed, rc=Not authorized` | Wrong gateway login | `bridge_secrets.py` vs 3.4 |
| Gateway `CERTIFICATE_VERIFY_FAILED` | Old `ca.crt` in `services\anomaly-detection\` | Copy `certs\ca.crt` again (3.6) |
| Gateway `cannot reach localhost:8883` | Mosquitto not running | Session step 2 |
| Gateway `ignored message from unregistered node` | UUID mismatch | Same UUID in `REGISTERED_NODES`, `NODE_ID`, `passwd` |
| Gateway `skipped, <field> is outside ...` | F-15 range check | Check the sensor; dropped on purpose |
| Broker `Only one usage of each socket address` | Another Mosquitto already on 8883 | Close the other window; 3.1 step 4 |
| Broker `Denied PUBLISH` | ACL blocked the topic | Topic must be `nodes/<own UUID>/telemetry` or `/trigger` |

Optional ESP32 TLS detail: in `connectMQTT()`, after the `failed, rc=%d` line, add
```cpp
char err[120]; espClient.lastError(err, sizeof(err));
Serial.printf("TLS: %s\n", err);
```

---

## 8. Before every push

```powershell
git status
```
Must **not** list: `secrets.h`, `bridge_secrets.py`, `*.pyc`, `__pycache__`, `ca.crt`, `passwd`, `certs/`, `captures/`.

## 9. Still open

1. Michelle runs the 5.2 re-test.
2. Remove committed secrets from IoT-AI (`bridge_secrets.pyc`, `__pycache__/`, `certs/ca.key`, `certs/server.key`), make new certificates and MQTT passwords. Michelle coordinates turning off the Supabase legacy keys.
3. Jira: CTIP-60 done after 5.2 passes; CTIP-61 comment (TLS login + F-15 checks); tell the CTIP-48 owner the logins were made with `mosquitto_passwd`.
4. Later: switch the gateway to `MODE = "api"` once `POST /telemetry` works; move the broker off the laptop when the bridge moves to `services/api`.
