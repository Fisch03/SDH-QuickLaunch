import os, json, base64

from subprocess import Popen, PIPE

from urllib.error import HTTPError
from urllib.request import urlopen, Request

confdir = "/home/deck/.config/SDH-QuickLaunch/"

send_buffer = []

def split_string(string):
    return [string[i:i+1024*60] for i in range(0, len(string), 1024*60)] # every 60KB

class Plugin:
    async def get_flatpaks(self):
        proc = Popen('flatpak list -d --app | awk  \'BEGIN {FS="\\t"} {print "{\\"name\\":\\""$1"\\",\\"package\\":\\""$3"\\"},"}\\\'', stdout=PIPE, stderr=None, shell=True)
        packages = proc.communicate()[0]
        packages = packages.decode("utf-8")
        packages = packages[:-2]
        return "["+packages+"]"

    async def get_config(self):
        with open(os.path.join(confdir,"config.json"), "r") as f:
            return json.load(f)
    async def set_config_value(self, key, value):
        config = json.load(open(os.path.join(confdir,"config.json")))
        config[key] = value
        with open(os.path.join(confdir,"config.json"), "w") as f:
            json.dump(config, f)

        return config

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

    async def get_req_json(self, url, auth):
        req = Request(url)
        req.add_header("User-Agent", "SDH-QuickLaunch")
        req.add_header("Authorization", "Bearer "+auth)

        try:
            content = urlopen(req).read()
            content = content.decode('utf-8')
            content = json.loads(content)
            return content
        except HTTPError:
            pass

    async def get_req_imgb64(self, url):
        global send_buffer
        if(len(send_buffer) != 0):
            return

        req = Request(url)
        req.add_header("User-Agent", "SDH-QuickLaunch")

        try:
            content = urlopen(req).read()
            img = base64.b64encode(content).decode('ascii')
            send_buffer = split_string(img)
            new_chunk = send_buffer.pop(0)
            return {"data": new_chunk, "is_last": len(send_buffer) == 0}   
        except HTTPError:
            pass

    async def receive_next_chunk(self):
        global send_buffer
        new_chunk = send_buffer.pop(0)
        return {"data": new_chunk, "is_last": len(send_buffer) == 0}

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
        try:
            sc = open(os.path.join(confdir,"config.json"), "x")
            sc.write("{}")
            sc.close()
        except FileExistsError:
            pass
