"""Impressora Bluetooth VIRTUAL para testes: um pseudo-terminal (como /dev/rfcommN, que é uma porta série/tty).
Uso: python3 -I fake-bt.py <ligação simbólica para a porta> <ficheiro onde guardar os bytes recebidos>
Por omissão um tty troca LF por CR LF (onlcr): se o servidor não puser a porta em modo raw, os CR aparecem na captura."""
import os, pty, select, sys, time

link, out = sys.argv[1], sys.argv[2]
master, slave = pty.openpty()  # o lado "slave" fica aberto aqui para a porta continuar a existir
name = os.ttyname(slave)
try:
    os.unlink(link)
except FileNotFoundError:
    pass
os.symlink(name, link)
print(name, flush=True)
with open(out, "ab") as f:
    while True:
        r, _, _ = select.select([master], [], [], 1)
        if master in r:
            try:
                data = os.read(master, 4096)
            except OSError:
                time.sleep(0.05)
                continue
            f.write(data)
            f.flush()
