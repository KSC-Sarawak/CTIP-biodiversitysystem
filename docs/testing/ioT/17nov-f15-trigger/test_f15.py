import sys, os, json, importlib.util, tempfile, types
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "stubs"))
spec = importlib.util.spec_from_file_location("gw", os.path.join(here, "work", "Nodegateway.py"))
gw = importlib.util.module_from_spec(spec); spec.loader.exec_module(gw)
logs = []
gw.log = lambda part, text: logs.append(f"[{part}] {text}")
uploads = []
gw.upload = lambda path: uploads.append(path) or True
tmp = tempfile.mkdtemp(); gw.PENDING_DIR = tmp
class Cam:
    def take_jpeg(self): return b"\xff\xd8fakejpeg"
cam = Cam()
A = "0ac66bdc-db55-4a8e-a7c6-4c30daa8124b"
def case(name, fn):
    logs.clear(); uploads.clear(); before = set(os.listdir(tmp)); fn()
    new = sorted(set(os.listdir(tmp)) - before)
    print(f"--- {name}\n    log: {logs}\n    files saved: {new}")
case("T1 registered node, source 'motion' (normal)", lambda: gw.handle_trigger(cam, A, "motion", {"source":"motion"}))
case("T2 source '..\\\\x' (path trick)", lambda: gw.handle_trigger(cam, A, "..\\x", {"source":"..\\x"}))
case("T3 save_photo with source '..\\\\..\\\\evil' directly", lambda: print("    saved as:", os.path.basename(gw.save_photo(tmp, A, "2026-11-17T10:00:00Z", "..\\..\\evil", b"x"))))
case("T4 save_photo with node id '../../etc'", lambda: print("    saved as:", os.path.basename(gw.save_photo(tmp, "../../etc", "2026-11-17T10:00:00Z", "motion", b"x"))))
case("T5 unregistered UUID node", lambda: gw.handle_trigger(cam, "22222222-2222-4222-8222-222222222222", "motion", {}))
case("T6 node id that is not a UUID", lambda: gw.handle_trigger(cam, "../../evil", "motion", {}))
class Msg:
    def __init__(s, t, p): s.topic=t; s.payload=p.encode()
def onmsg(t,p):
    gw.trigger_q.queue.clear(); gw.telemetry_q.queue.clear(); gw.on_message(None,None,Msg(t,p))
    print("    trigger queue:", list(gw.trigger_q.queue), " telemetry queue:", len(gw.telemetry_q.queue))
case("T7 MQTT trigger on unregistered node topic", lambda: onmsg("nodes/22222222-2222-4222-8222-222222222222/trigger", '{"source":"motion"}'))
case("T8 MQTT trigger with bad JSON", lambda: onmsg(f"nodes/{A}/trigger", 'not json'))
case("T9 MQTT trigger, registered node", lambda: onmsg(f"nodes/{A}/trigger", '{"source":"motion"}'))
print("--- files in pending folder:", sorted(os.listdir(tmp)))
print("--- anything written outside it?", [p for p in os.listdir(os.path.dirname(tmp)) if p.endswith('.jpg')])
