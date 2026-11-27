import os, json, base64, ssl, certifi, re, struct, shutil, pwd, stat, tempfile
from pathlib import Path
from json import dumps as jsonDumps
from itertools import chain

import decky_plugin

from subprocess import Popen, PIPE

from urllib.error import HTTPError
from urllib.request import urlopen, Request


confdir = os.environ["DECKY_PLUGIN_SETTINGS_DIR"]

send_buffer = []


def split_string(string):
    return [
        string[i : i + 1024 * 60] for i in range(0, len(string), 1024 * 60)
    ]  # every 60KB


def clean_desktop_exec(exec_str: str) -> str:
    # Remove standard desktop field codes like %f, %F, %u, %U, %d, %D, %n, %N, %i, %c, %k, %v, %m
    # and Flatpak wrapper markers @@u %U @@ or @@ %F @@
    cleaned = re.sub(r'@@[a-zA-Z0-9_]*\s+[^@]+@@', '', exec_str)
    cleaned = re.sub(r'%[a-zA-Z]', '', cleaned)
    return cleaned.strip()


def parse_desktop_file(path: Path):
    name = None
    exec_cmd = None
    icon = None
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            in_main_section = False
            for line in f:
                line = line.strip()
                if line.startswith('[') and line.endswith(']'):
                    in_main_section = (line == '[Desktop Entry]')
                    continue
                if in_main_section:
                    if line.startswith('Name=') and name is None:
                        name = line[5:].strip()
                    elif line.startswith('Exec=') and exec_cmd is None:
                        exec_cmd = clean_desktop_exec(line[5:].strip())
                    elif line.startswith('Icon=') and icon is None:
                        icon = line[5:].strip()
                    if name and exec_cmd and icon:
                        break
    except Exception:
        pass
    return name, exec_cmd, icon


def _parse_binary_vdf(data: bytes, pos: int = 0):
    # Steam's shortcuts.vdf uses Valve's binary VDF format:
    # 0x00=dict, 0x01=utf8 string, 0x02=uint32, 0x03=float32, 0x07=uint64, 0x08=end-of-dict
    res = {}
    length = len(data)
    while pos < length:
        val_type = data[pos]
        pos += 1
        if val_type == 0x08:
            break
        end = data.find(b"\x00", pos)
        if end == -1:
            break
        key = data[pos:end].decode("utf-8", "ignore")
        pos = end + 1
        if val_type == 0x00:
            val, pos = _parse_binary_vdf(data, pos)
            res[key] = (0x00, val)
        elif val_type == 0x01:
            end = data.find(b"\x00", pos)
            if end == -1:
                break
            val = data[pos:end].decode("utf-8", "ignore")
            pos = end + 1
            res[key] = (0x01, val)
        elif val_type == 0x02:
            val = struct.unpack("<I", data[pos : pos + 4])[0]
            pos += 4
            res[key] = (0x02, val)
        elif val_type == 0x03:
            val = data[pos : pos + 4]
            pos += 4
            res[key] = (0x03, val)
        elif val_type == 0x07:
            val = data[pos : pos + 8]
            pos += 8
            res[key] = (0x07, val)
        else:
            break
    return res, pos


def _dump_binary_vdf(obj: dict) -> bytes:
    buf = bytearray()
    for key, (val_type, val) in obj.items():
        buf.append(val_type)
        buf.extend(key.encode("utf-8") + b"\x00")
        if val_type == 0x00:
            buf.extend(_dump_binary_vdf(val))
        elif val_type == 0x01:
            buf.extend(str(val).encode("utf-8") + b"\x00")
        elif val_type == 0x02:
            buf.extend(struct.pack("<I", int(val) & 0xFFFFFFFF))
        elif val_type in (0x03, 0x07):
            buf.extend(val)
    buf.append(0x08)
    return bytes(buf)


def _get_steam_root() -> Path:
    home = Path(decky_plugin.DECKY_USER_HOME)
    for candidate in (home / ".steam" / "root", home / ".local" / "share" / "Steam"):
        if candidate.exists():
            return candidate
    return home / ".steam" / "root"


def _get_shortcuts_vdf_path(account_id: str = ""):
    if not account_id or not account_id.isdigit():
        return None
    steam_root = _get_steam_root()
    candidate = steam_root / "userdata" / account_id / "config" / "shortcuts.vdf"
    return str(candidate) if candidate.exists() else None


def _find_key_ci(entry: dict, target: str):
    target_lower = target.lower()
    for k in entry.keys():
        if k.lower() == target_lower:
            return k
    return None


def _read_shortcuts_vdf(vdf_path: str):


class Plugin:
    async def get_flatpaks(self):
        # Index installed Flatpak .desktop files to get their real name, full Exec command, path, and icon
        desktop_map = {}
        flatpak_desktop_dirs = [
            Path("/var/lib/flatpak/exports/share/applications"),
            Path(f"{decky_plugin.DECKY_USER_HOME}/.local/share/flatpak/exports/share/applications"),
        ]
        for fdir in flatpak_desktop_dirs:
            if not fdir.exists():
                continue
            for desktop_file in fdir.glob("*.desktop"):
                app_id = desktop_file.stem
                name, exec_cmd, icon = parse_desktop_file(desktop_file)
                if app_id and exec_cmd:
                    try:
                        resolved_path = str(desktop_file.resolve())
                    except Exception:
                        resolved_path = str(desktop_file)
                    desktop_map[app_id] = (name, exec_cmd, resolved_path, icon)

        def list_flatpaks(cmd):
            flatpaks = []

            clean_env = os.environ.copy()
            clean_env["LD_LIBRARY_PATH"] = ""
            with Popen(cmd, stdout=PIPE, stderr=None, env=clean_env, text=True) as p:
                for line in p.stdout:
                    if '\t' not in line:
                        continue

                    name, app_id = line.strip().split('\t', 1)

                    name = name.strip()
                    app_id = app_id.strip()
                    if not name or not app_id:
                        continue

                    # If .desktop file exists, use its precise name, exec command, path, and icon
                    desktop_info = desktop_map.get(app_id)
                    desktop_path = None
                    icon = None
                    if desktop_info:
                        desktop_name, desktop_exec, desktop_path, icon = desktop_info
                        if desktop_name:
                            name = desktop_name
                        exec_line = desktop_exec
                    else:
                        exec_line = f"/usr/bin/flatpak run {app_id}"

                    entry = {
                        "id": app_id,
                        "name": name,
                        "exec": exec_line,
                    }
                    if desktop_path:
                        entry["desktopPath"] = desktop_path
                    if icon:
                        entry["icon"] = icon

                    flatpaks.append(entry)

            return flatpaks

        global_flatpaks = list_flatpaks([
            'flatpak', 'list', '--app', '--columns=name,application'
        ])

        local_flatpaks = list_flatpaks([
            'runuser', '-l', decky_plugin.DECKY_USER, '-c',
            'flatpak list --app --columns=name,application'
        ])

        seen = set()
        unique_flatpaks = []

        for flatpak in global_flatpaks + local_flatpaks:
            if flatpak["id"] not in seen:
                seen.add(flatpak["id"])
                unique_flatpaks.append(flatpak)

        sorted_items = sorted(unique_flatpaks, key=lambda x: x.get("name", "").lower())

        return jsonDumps(sorted_items)

    async def get_desktops(self):
        packages = []
        for desktopFile in chain(
            Path("/usr/share/applications").glob("*.desktop"),
            Path(f"{decky_plugin.DECKY_USER_HOME}/.local/share/applications/").glob("*.desktop"),
        ):
            if not desktopFile.is_file():
                continue
            name, exec_cmd, icon = parse_desktop_file(desktopFile)
            if name and exec_cmd:
                try:
                    resolved_path = str(desktopFile.resolve())
                except Exception:
                    resolved_path = str(desktopFile)
                entry = {
                    "name": name,
                    "exec": exec_cmd,
                    "desktopPath": resolved_path,
                }
                if icon:
                    entry["icon"] = icon
                packages.append(entry)

        return jsonDumps(packages)

    async def prepare_add_non_steam_game(self):
        # Steam only accepts local .desktop paths on steam://addnonsteamgame/ while this sentinel exists.
        # Open with O_NOFOLLOW + fstat/fchown/fchmod since the Decky backend runs as root.
        sentinel = "/tmp/addnonsteamgamefile"
        fd = None
        try:
            fd = os.open(sentinel, os.O_CREAT | os.O_WRONLY | os.O_NOFOLLOW, 0o666)
            st = os.fstat(fd)
            if not stat.S_ISREG(st.st_mode):
                return False
            try:
                pw = pwd.getpwnam(decky_plugin.DECKY_USER)
                os.fchown(fd, pw.pw_uid, pw.pw_gid)
            except Exception:
                pass
            os.fchmod(fd, 0o666)
            return True
        except Exception as e:
            decky_plugin.logger.error(f"Failed to create {sentinel}: {e}")
            return False
        finally:
            if fd is not None:
                try:
                    os.close(fd)
                except Exception:
                    pass

    async def find_shortcut_appids(self, desktop_path: str, account_id: str = ""):
        if not desktop_path:
            return []
        vdf_path = _get_shortcuts_vdf_path(account_id)
        if not vdf_path:
            return []

        targets = {desktop_path}
        try:
            targets.add(str(Path(desktop_path).resolve()))
        except Exception:
            pass

        matched = []
        try:
            _, shortcuts, _ = _read_shortcuts_vdf(vdf_path)
            if not shortcuts:
                return []
            for _, entry_pair in shortcuts.items():
                if entry_pair[0] != 0x00:
                    continue
                entry = entry_pair[1]
                sp_key = _find_key_ci(entry, "ShortcutPath")
                if sp_key and entry[sp_key][1] in targets:
                    appid_key = _find_key_ci(entry, "appid")
                    if appid_key:
                        aid = int(entry[appid_key][1]) & 0xFFFFFFFF
                        if aid not in matched:
                            matched.append(aid)
        except Exception as e:
            decky_plugin.logger.error(f"Failed to read {vdf_path}: {e}")
        return matched

    async def set_shortcut_path(self, appid: int, desktop_path: str, icon: str = "", account_id: str = ""):
        # Fallback for shortcuts created via AddShortcut: Steam treats shortcuts without a
        # .desktop ShortcutPath as generic executables and wraps them with Proton/compatdata.
        if not desktop_path:
            return False
        vdf_path = _get_shortcuts_vdf_path(account_id)
        if not vdf_path:
            return False

        target_appid = int(appid) & 0xFFFFFFFF
        updated = False

        try:
            parsed, shortcuts, st = _read_shortcuts_vdf(vdf_path)
            if not shortcuts:
                return False
            file_modified = False
            for _, entry_pair in shortcuts.items():
                if entry_pair[0] != 0x00:
                    continue
                entry = entry_pair[1]
                appid_key = _find_key_ci(entry, "appid")
                if not appid_key:
                    continue
                if (int(entry[appid_key][1]) & 0xFFFFFFFF) != target_appid:
                    continue

                sp_key = _find_key_ci(entry, "ShortcutPath") or "ShortcutPath"
                if sp_key not in entry or entry[sp_key][1] != desktop_path:
                    entry[sp_key] = (0x01, desktop_path)
                    file_modified = True

                if icon:
                    icon_key = _find_key_ci(entry, "icon") or "icon"
                    if icon_key not in entry or not entry[icon_key][1]:
                        entry[icon_key] = (0x01, icon)
                        file_modified = True

            if file_modified:
                tmp_path = None
                try:
                    with tempfile.NamedTemporaryFile(
                        mode="wb",
                        dir=os.path.dirname(vdf_path),
                        prefix="shortcuts.",
                        suffix=".tmp",
                        delete=False,
                    ) as tmp_file:
                        tmp_path = tmp_file.name
                        tmp_file.write(_dump_binary_vdf(parsed))
                        tmp_file.flush()
                        os.fchown(tmp_file.fileno(), st.st_uid, st.st_gid)
                        os.fchmod(tmp_file.fileno(), st.st_mode)
                    os.replace(tmp_path, vdf_path)
                    tmp_path = None
                    updated = True
                finally:
                    if tmp_path and os.path.exists(tmp_path):
                        try:
                            os.unlink(tmp_path)
                        except Exception:
                            pass
        except Exception as e:
            decky_plugin.logger.error(f"Failed to update {vdf_path}: {e}")

        # Remove any stale Proton compatdata directory created for this native shortcut
        if updated and target_appid >= 0x80000000:
            try:
                compat_dir = _get_steam_root() / "steamapps" / "compatdata" / str(target_appid)
                if compat_dir.exists() and compat_dir.is_dir():
                    shutil.rmtree(compat_dir, ignore_errors=True)
            except Exception as e:
                decky_plugin.logger.error(f"Failed to clean compatdata for {target_appid}: {e}")

        return updated

    async def get_DECKY_USER_HOME(self):
        return decky_plugin.DECKY_USER_HOME

    async def get_config(self):
        with open(os.path.join(confdir, "config.json"), "r") as f:
            return json.load(f)

    async def set_config_value(self, key, value):
        config = json.load(open(os.path.join(confdir, "config.json")))
        config[key] = value
        with open(os.path.join(confdir, "config.json"), "w") as f:
            json.dump(config, f)

        return config

    async def get_id(self):
        with open(os.path.join(confdir, "scid.txt"), "r") as sc:
            id = sc.read()
            try:
                id = int(id)
                return id
            except ValueError:
                return -1

    async def set_id(self, id):
        with open(os.path.join(confdir, "scid.txt"), "w") as sc:
            sc.write(str(id))

    async def get_req_imgb64(self, url):
        global send_buffer
        if len(send_buffer) != 0:
            return

        req = Request(url)

        req.add_header("User-Agent", "SDH-QuickLaunch")

        try:
            content = urlopen(
                req, context=ssl.create_default_context(cafile=certifi.where())
            ).read()
            img = base64.b64encode(content).decode("ascii")
            send_buffer = split_string(img)
            new_chunk = send_buffer.pop(0)
            return {"data": new_chunk, "is_last": len(send_buffer) == 0}
        except HTTPError:
            decky_plugin.logger.error("HTTPError while requesting " + url)
            pass

    async def receive_next_chunk(self):
        global send_buffer
        new_chunk = send_buffer.pop(0)
        return {"data": new_chunk, "is_last": len(send_buffer) == 0}

    async def _main(self):
        decky_plugin.logger.info("Loading plugin")

        try:
            os.mkdir(confdir)
        except FileExistsError:
            pass

        try:
            sc = open(os.path.join(confdir, "scid.txt"), "x")
            sc.close()
        except FileExistsError:
            pass
        try:
            sc = open(os.path.join(confdir, "config.json"), "x")
            sc.write("{}")
            sc.close()
        except FileExistsError:
            pass

        decky_plugin.logger.info("Plugin loaded")

    async def _unload(self):
        pass
