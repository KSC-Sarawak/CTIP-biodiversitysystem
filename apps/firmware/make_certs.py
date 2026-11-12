"""
make_certs.py - TLS certificates for the team Mosquitto broker (CTIP-60, F-14)

Creates, in infra/mosquitto/certs/ (git-ignored):
  ca.crt      public. Copy to the gateway folder and into the ESP32 secrets.h
  ca.key      PRIVATE. Never share or commit
  server.crt  the broker's certificate, valid for localhost and the IPs you give
  server.key  PRIVATE. Never share or commit

The CA is made once and then reused. If the laptop's IP changes, run this
again with the new IP: only the server certificate is remade, so the ESP32
keeps working without a new ca.crt.

Run (PowerShell, from infra/mosquitto, with the .venv active):
    pip install cryptography
    python make_certs.py 192.168.137.1
"""
import datetime
import ipaddress
import os
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

HERE = os.path.dirname(os.path.abspath(__file__))
CERTS = os.path.join(HERE, "certs")


def new_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def save_key(key, path):
    with open(path, "wb") as f:
        f.write(key.private_bytes(serialization.Encoding.PEM,
                                  serialization.PrivateFormat.TraditionalOpenSSL,
                                  serialization.NoEncryption()))


def save_cert(cert, path):
    with open(path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))


def make_ca(now):
    key = new_key()
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Daun Sense IoT CA")])
    cert = (x509.CertificateBuilder()
            .subject_name(name).issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=5 * 365))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(x509.KeyUsage(digital_signature=False, content_commitment=False,
                                         key_encipherment=False, data_encipherment=False,
                                         key_agreement=False, key_cert_sign=True, crl_sign=True,
                                         encipher_only=False, decipher_only=False), critical=True)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
            .sign(key, hashes.SHA256()))
    return key, cert


def make_server(ca_key, ca_cert, ips, now):
    key = new_key()
    # IP entries for the gateway and modern TLS libraries. The same IPs are
    # also added as DNS names, because older ESP32 TLS (mbedTLS 2.x) only
    # compares the host text with DNS names.
    alt = [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
    for ip in ips:
        alt.append(x509.IPAddress(ipaddress.ip_address(ip)))
        alt.append(x509.DNSName(ip))
    cn = ips[0] if ips else "localhost"
    cert = (x509.CertificateBuilder()
            .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)]))
            .issuer_name(ca_cert.subject)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=2 * 365))
            .add_extension(x509.SubjectAlternativeName(alt), critical=False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
            .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),
                           critical=False)
            .sign(ca_key, hashes.SHA256()))
    return key, cert


def main():
    ips = sys.argv[1:]
    for ip in ips:
        ipaddress.ip_address(ip)   # stops here with an error if it is not an IP
    if not ips:
        print("Give the laptop's hotspot IP, e.g.  python make_certs.py 192.168.137.1")
        return
    os.makedirs(CERTS, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc)

    ca_crt, ca_key_path = os.path.join(CERTS, "ca.crt"), os.path.join(CERTS, "ca.key")
    if os.path.exists(ca_crt) and os.path.exists(ca_key_path):
        with open(ca_key_path, "rb") as f:
            ca_key = serialization.load_pem_private_key(f.read(), password=None)
        with open(ca_crt, "rb") as f:
            ca_cert = x509.load_pem_x509_certificate(f.read())
        print("Reusing existing CA (ESP32 does not need a new ca.crt)")
    else:
        ca_key, ca_cert = make_ca(now)
        save_key(ca_key, ca_key_path)
        save_cert(ca_cert, ca_crt)
        print("Made new CA: certs/ca.crt (public), certs/ca.key (PRIVATE)")

    key, cert = make_server(ca_key, ca_cert, ips, now)
    save_key(key, os.path.join(CERTS, "server.key"))
    save_cert(cert, os.path.join(CERTS, "server.crt"))
    print("Made server certificate for localhost, 127.0.0.1, " + ", ".join(ips))


if __name__ == "__main__":
    main()
