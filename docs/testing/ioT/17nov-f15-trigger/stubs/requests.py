# Stand-in for requests: these checks never call the network.
def post(*args, **kwargs):
    raise RuntimeError("no network in these checks")
get = put = post
