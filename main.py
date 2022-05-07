import os
from subprocess import Popen, PIPE

confdir = "/home/deck/.config/SDH-QuickLaunch/"

class Plugin:
    async def get_flatpaks(self):
        proc = Popen('flatpak list -d --app | awk  \'BEGIN {FS="\\t"} {print "{\\"name\\":\\""$1"\\",\\"package\\":\\""$3"\\"},"}\\\'', stdout=PIPE, stderr=None, shell=True)
        packages = proc.communicate()[0]
        packages = packages.decode("utf-8")
        packages = packages[:-2]
        return packages

    async def get_id(self):
        with open(os.path.join(confdir,"scid.txt"), "r") as sc:
            id = sc.read()
            try:
                id = int(id)
                return id
            except ValueError:
                return -1

    async def set_id(self, id):
        with open(os.path.join(confdir,"scid.txt"), "w") as sc:
            sc.write(str(id))

    async def _main(self):
        try:
            os.mkdir(confdir)
        except FileExistsError:
            pass
        
        try:
            sc = open(os.path.join(confdir,"scid.txt"), "x")
            sc.close()
        except FileExistsError:
            pass
