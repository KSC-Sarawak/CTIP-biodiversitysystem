# Stand-in for paho-mqtt so the gateway can be imported without a broker.
class Client:
    def __init__(self, *args, **kwargs):
        pass
