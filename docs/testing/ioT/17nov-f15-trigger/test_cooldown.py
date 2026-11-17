import sys, os, importlib.util, tempfile, queue
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "stubs"))
spec = importlib.util.spec_from_file_location("gw", os.path.join(here, "work", "Nodegateway.py"))
gw = importlib.util.module_from_spec(spec); spec.loader.exec_module(gw)
logs=[]; gw.log=lambda p,t: logs.append(t)
gw.PENDING_DIR=tempfile.mkdtemp(); gw.upload=lambda p: True; gw.retry_pending=lambda: None
class C:
    def connect_async(s,*a,**k): pass
    def loop_start(s): pass
    def loop_stop(s): pass
    def disconnect(s): pass
gw.SENSOR_KEY="test"; gw.MQTT_USER="u"; gw.MQTT_PASSWORD="p"
gw.make_client=lambda: C()
class Cam:
    def take_jpeg(s): return b"x"
    def close(s): pass
gw.open_camera=lambda: Cam()
A="0ac66bdc-db55-4a8e-a7c6-4c30daa8124b"
class Q:
    def __init__(s,items): s.items=list(items)
    def get(s,timeout=1):
        if s.items: return s.items.pop(0)
        raise KeyboardInterrupt
gw.trigger_q=Q([(A,"motion",{})]*10)
os.makedirs(gw.PENDING_DIR, exist_ok=True)
sys.argv=["Nodegateway.py"]
try: gw.main()
except SystemExit: pass
photos=[l for l in logs if "photo " in l]; skipped=[l for l in logs if "cooldown" in l]
print("10 triggers in a burst from one node -> photos taken:", len(photos), " skipped by cooldown:", len(skipped))
print("files:", len(os.listdir(gw.PENDING_DIR)))
